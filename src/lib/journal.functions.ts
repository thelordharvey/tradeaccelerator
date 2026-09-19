import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const connectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  login: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
  server: z.string().trim().min(1).max(160),
  platform: z.enum(["mt4", "mt5"]),
});

const accountSchema = z.object({ accountId: z.string().uuid() });

const PROVISIONING_URL = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_URL = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

type MetaDeal = {
  id?: string;
  ticket?: string | number;
  positionId?: string | number;
  symbol?: string;
  type?: string;
  entryType?: string;
  volume?: number;
  price?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  time?: string;
};

function providerError(status: number, body: string) {
  console.error(`MetaApi request failed [${status}]: ${body}`);
  if (status === 401 || status === 403) return "The MetaTrader connection was rejected. Check the login, investor password, and broker server.";
  if (status === 429) return "The broker bridge is busy. Wait a moment, then try again.";
  return "The broker account could not be reached right now.";
}

export const getBrokerBridgeStatus = createServerFn({ method: "GET" }).handler(async () => ({
  configured: Boolean(process.env["METAAPI_TOKEN"]),
}));

export const connectMetaTrader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => connectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env["METAAPI_TOKEN"];
    if (!token) return { ok: false as const, reason: "not_configured" as const };

    const response = await fetch(`${PROVISIONING_URL}/users/current/accounts`, {
      method: "POST",
      headers: {
        "auth-token": token,
        "transaction-id": crypto.randomUUID(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
        login: data.login,
        password: data.password,
        server: data.server,
        platform: data.platform,
        magic: 0,
        type: "cloud-g2",
        reliability: "regular",
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(providerError(response.status, body));
    const created = JSON.parse(body) as { id?: string };
    if (!created.id) throw new Error("The broker bridge did not return an account ID.");

    const { data: account, error } = await context.supabase
      .from("trading_accounts")
      .insert({
        user_id: context.userId,
        external_account_id: created.id,
        account_name: data.name,
        login: data.login,
        server_name: data.server,
        platform: data.platform,
        status: "deploying",
      })
      .select("id")
      .single();
    if (error) throw error;

    const deploy = await fetch(`${PROVISIONING_URL}/users/current/accounts/${created.id}/deploy`, {
      method: "POST",
      headers: { "auth-token": token },
    });
    if (!deploy.ok) {
      const deployBody = await deploy.text();
      await context.supabase
        .from("trading_accounts")
        .update({ status: "failed", last_error: providerError(deploy.status, deployBody) })
        .eq("id", account.id);
      throw new Error(providerError(deploy.status, deployBody));
    }

    return { ok: true as const, accountId: account.id };
  });

export const syncMetaTrader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => accountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env["METAAPI_TOKEN"];
    if (!token) return { ok: false as const, reason: "not_configured" as const };
    const { data: account, error } = await context.supabase
      .from("trading_accounts")
      .select("id,external_account_id")
      .eq("id", data.accountId)
      .single();
    if (error || !account) throw new Error("Trading account not found.");

    await context.supabase.from("trading_accounts").update({ status: "syncing" }).eq("id", account.id);
    const end = new Date();
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 2);
    const url = `${CLIENT_URL}/users/current/accounts/${account.external_account_id}/history-deals/time/${encodeURIComponent(start.toISOString())}/${encodeURIComponent(end.toISOString())}?limit=1000`;
    const response = await fetch(url, { headers: { "auth-token": token } });
    const body = await response.text();
    if (!response.ok) {
      const message = providerError(response.status, body);
      await context.supabase.from("trading_accounts").update({ status: "failed", last_error: message }).eq("id", account.id);
      throw new Error(message);
    }
    const payload = JSON.parse(body) as { deals?: MetaDeal[] } | MetaDeal[];
    const deals = Array.isArray(payload) ? payload : payload.deals ?? [];
    const rows = deals
      .filter((deal) => deal.id || deal.ticket)
      .map((deal) => ({
        user_id: context.userId,
        trading_account_id: account.id,
        external_trade_id: String(deal.id ?? deal.ticket),
        position_id: deal.positionId == null ? null : String(deal.positionId),
        symbol: deal.symbol ?? "UNKNOWN",
        asset_class: "forex",
        side: deal.type?.toLowerCase().includes("sell") ? "sell" : "buy",
        status: deal.entryType?.toLowerCase().includes("out") ? "closed" : "open",
        volume: Number(deal.volume ?? 0),
        open_price: Number(deal.price ?? 0),
        close_price: deal.entryType?.toLowerCase().includes("out") ? Number(deal.price ?? 0) : null,
        commission: Number(deal.commission ?? 0),
        swap: Number(deal.swap ?? 0),
        profit: Number(deal.profit ?? 0),
        opened_at: deal.time ?? new Date().toISOString(),
        closed_at: deal.entryType?.toLowerCase().includes("out") ? (deal.time ?? new Date().toISOString()) : null,
        raw_data: deal,
      }));
    if (rows.length > 0) {
      const { error: upsertError } = await context.supabase
        .from("trades")
        .upsert(rows, { onConflict: "trading_account_id,external_trade_id" });
      if (upsertError) throw upsertError;
    }
    await context.supabase
      .from("trading_accounts")
      .update({ status: "connected", last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", account.id);
    return { ok: true as const, imported: rows.length };
  });

export const disconnectMetaTrader = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => accountSchema.parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env["METAAPI_TOKEN"];
    const { data: account, error } = await context.supabase
      .from("trading_accounts")
      .select("id,external_account_id")
      .eq("id", data.accountId)
      .single();
    if (error || !account) throw new Error("Trading account not found.");
    if (token) {
      const response = await fetch(`${PROVISIONING_URL}/users/current/accounts/${account.external_account_id}/undeploy`, {
        method: "POST",
        headers: { "auth-token": token },
      });
      if (!response.ok) console.error(`MetaApi undeploy failed [${response.status}]: ${await response.text()}`);
    }
    const { error: updateError } = await context.supabase
      .from("trading_accounts")
      .update({ status: "disconnected" })
      .eq("id", account.id);
    if (updateError) throw updateError;
    return { ok: true as const };
  });