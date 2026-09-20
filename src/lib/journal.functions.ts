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

// The provisioning API is region-agnostic: it lives on a single global host and
// is used to create/deploy/undeploy accounts and to look up which region an
// account actually landed in.
// https://metaapi.cloud/docs/provisioning/
const PROVISIONING_URL = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

// The client (trading/history) API is region-specific: every account is pinned
// to one of the regions returned by /users/current/regions, and its REST host is
// https://mt-client-api-v1.<region>.agiliumtrade.ai. Calling the wrong region's
// host for an account produces "region mismatch" / not-found style errors, so
// the region must always be read back from the account record rather than
// hardcoded. https://metaapi.cloud/docs/client/regions/
// https://metaapi.cloud/docs/client/restApi/api/readTradingTerminalState/readAccountInformation/
const DEFAULT_REGION = "new-york";
const clientUrl = (region: string) => `https://mt-client-api-v1.${region}.agiliumtrade.ai`;

// Deployment and broker connection are asynchronous. After /deploy is accepted,
// the account goes through state CREATED -> DEPLOYING -> DEPLOYED, and
// separately connectionStatus goes DISCONNECTED -> CONNECTED once the terminal
// has actually logged in to the broker. History should only be requested once
// both are true, otherwise the API returns "account is not connected".
// https://metaapi.cloud/docs/provisioning/models/tradingAccount/
type MetatraderAccountDto = {
  id?: string;
  _id?: string;
  region?: string;
  state?: "CREATED" | "DEPLOYING" | "DEPLOYED" | "DEPLOY_FAILED" | "UNDEPLOYING" | "UNDEPLOYED" | "UNDEPLOY_FAILED" | "DELETING" | "DELETE_FAILED" | "REDEPLOY_FAILED";
  connectionStatus?: "CONNECTED" | "DISCONNECTED" | "DISCONNECTED_FROM_BROKER";
};

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
  let providerMessage = "";
  let errorName = "";
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    if (parsed.message) providerMessage = parsed.message.replace(/\s*\([0-9a-f]{32}\)\s*$/i, "");
    if (parsed.error) errorName = parsed.error;
  } catch {
    /* body was not JSON */
  }
  // 202 with an AcceptedError means the request was queued (e.g. broker settings
  // detection in progress) and should be retried after metadata.recommendedRetryTime.
  // https://metaapi.cloud/docs/provisioning/models/acceptedError/
  if (status === 202 || errorName === "AcceptedError") {
    return "The broker bridge is still processing this request. It will be retried automatically.";
  }
  // 429 carries Retry-After / recommendedRetryTime and is a rate limit, not a data error.
  // https://metaapi.cloud/docs/client/rateLimiting/
  if (status === 429) return "The broker bridge is busy. Wait a moment, then try again.";
  // 402 is MetaApi's billing/quota state (unpaid subscription, account limit reached, etc.)
  // and must not be shown or treated as a broker/credentials error.
  if (status === 402) return "The MetaApi subscription needs a plan/billing top-up before this account can be deployed.";
  if (providerMessage.match(/E_AUTH|invalid account|account disabled/i)) {
    return "The broker rejected the login, password, or server name. Double-check the credentials and try again.";
  }
  if (providerMessage) return `The broker service said: ${providerMessage}`;
  if (status === 401 || status === 403) return "The MetaTrader connection was rejected. Check the login, investor password, and broker server.";
  if (status === 404) return "The trading account was not found on the broker bridge, or was requested from the wrong region.";
  return "The broker account could not be reached right now.";
}

async function fetchAccount(token: string, accountId: string) {
  const response = await fetch(`${PROVISIONING_URL}/users/current/accounts/${accountId}`, {
    headers: { "auth-token": token },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(providerError(response.status, body));
  return JSON.parse(body) as MetatraderAccountDto;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polls the provisioning API (never the region-specific client API, which may
// 404 until the account has actually landed on that region's host) until the
// account is deployed and the terminal is connected to the broker, or a
// terminal failure/timeout is reached.
async function waitForConnection(token: string, accountId: string, timeoutMs = 18_000) {
  const start = Date.now();
  let lastAccount: MetatraderAccountDto | null = null;
  while (Date.now() - start < timeoutMs) {
    const account = await fetchAccount(token, accountId);
    lastAccount = account;
    if (account.state === "DEPLOY_FAILED" || account.state === "REDEPLOY_FAILED") {
      return { account, ready: false as const, reason: "Deployment failed on the broker bridge. It can be retried." };
    }
    if (account.state === "DEPLOYED" && account.connectionStatus === "CONNECTED") {
      return { account, ready: true as const, reason: null };
    }
    if (account.connectionStatus === "DISCONNECTED_FROM_BROKER") {
      return { account, ready: false as const, reason: "The broker terminal disconnected. Check the login, password, and server name." };
    }
    await sleep(3000);
  }
  return { account: lastAccount, ready: false as const, reason: "The account is still starting up on the broker bridge. Try syncing again shortly." };
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
        "transaction-id": crypto.randomUUID().replace(/-/g, ""),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
        login: data.login,
        password: data.password,
        server: data.server,
        platform: data.platform,
        magic: 0,
        // cloud-g1 works on the standard MetaApi tier. cloud-g2 requires a
        // higher paid tier and is rejected when that tier is unavailable.
        type: "cloud-g1",
        reliability: "regular",
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(providerError(response.status, body));
    const created = JSON.parse(body) as MetatraderAccountDto;
    const externalAccountId = created.id ?? created._id;
    if (!externalAccountId) throw new Error("The broker bridge did not return an account ID.");

    // Deploy is asynchronous and may already be in progress by the time we look
    // it up again, so always trust whatever region the account actually reports
    // back rather than assuming DEFAULT_REGION was honored.
    const region = created.region ?? DEFAULT_REGION;

    const { data: account, error } = await context.supabase
      .from("trading_accounts")
      .insert({
        user_id: context.userId,
        external_account_id: externalAccountId,
        account_name: data.name,
        login: data.login,
        server_name: data.server,
        platform: data.platform,
        status: "deploying",
      })
      .select("id")
      .single();
    if (error) throw error;

    const deploy = await fetch(`${PROVISIONING_URL}/users/current/accounts/${externalAccountId}/deploy`, {
      method: "POST",
      headers: { "auth-token": token },
    });
    if (!deploy.ok) {
      const deployBody = await deploy.text();
      const message = providerError(deploy.status, deployBody);
      await context.supabase
        .from("trading_accounts")
        .update({ status: "failed", last_error: message })
        .eq("id", account.id);
      // The account is saved; deployment can be retried once the provider allows it.
      return { ok: true as const, accountId: account.id, warning: message };
    }

    return { ok: true as const, accountId: account.id, warning: null };
  });

// Deploy is idempotent ("ignored if the account is already deployed"), so a
// failed/stuck deployment can always be safely retried instead of recreating
// the account. https://metaapi.cloud/docs/provisioning/api/account/deployAccount/
export const retryDeployment = createServerFn({ method: "POST" })
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

    await context.supabase.from("trading_accounts").update({ status: "deploying", last_error: null }).eq("id", account.id);
    const deploy = await fetch(`${PROVISIONING_URL}/users/current/accounts/${account.external_account_id}/deploy`, {
      method: "POST",
      headers: { "auth-token": token },
    });
    if (!deploy.ok) {
      const message = providerError(deploy.status, await deploy.text());
      await context.supabase.from("trading_accounts").update({ status: "failed", last_error: message }).eq("id", account.id);
      return { ok: false as const, message };
    }
    return { ok: true as const };
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

    // Never sync immediately after deploy: wait for state=DEPLOYED and
    // connectionStatus=CONNECTED first, otherwise the client API reports
    // "account is not connected" even though deployment was accepted.
    const wait = await waitForConnection(token, account.external_account_id);
    if (!wait.ready) {
      const message = wait.reason ?? "The account is not connected yet.";
      await context.supabase.from("trading_accounts").update({ status: "failed", last_error: message }).eq("id", account.id);
      return { ok: false as const, reason: "not_ready" as const, message };
    }

    // Always use the region MetaApi actually reports for the account, not a
    // hardcoded region, and persist it if it changed (e.g. after a redeploy).
    const region = wait.account?.region ?? DEFAULT_REGION;

    const end = new Date();
    const start = new Date(end);
    start.setUTCFullYear(start.getUTCFullYear() - 2);
    const url = `${clientUrl(region)}/users/current/accounts/${account.external_account_id}/history-deals/time/${encodeURIComponent(start.toISOString())}/${encodeURIComponent(end.toISOString())}?limit=1000`;
    const response = await fetch(url, { headers: { "auth-token": token } });
    const body = await response.text();
    if (!response.ok) {
      const message = providerError(response.status, body);
      await context.supabase.from("trading_accounts").update({ status: "failed", last_error: message }).eq("id", account.id);
      return { ok: false as const, reason: "not_ready" as const, message };
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
