import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { User } from "@supabase/supabase-js";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link2, RefreshCw, Search, Unplug, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { connectMetaTrader, disconnectMetaTrader, getBrokerBridgeStatus, retryDeployment, syncMetaTrader } from "@/lib/journal.functions";
import { toast } from "sonner";

type Account = { id: string; account_name: string; login: string; server_name: string; platform: string; currency: string; status: string; last_synced_at: string | null };
type Trade = { id: string; symbol: string; side: string; status: string; volume: number; open_price: number | null; close_price: number | null; profit: number; opened_at: string; closed_at: string | null };

const demoTrades: Trade[] = [
  { id: "d1", symbol: "XAUUSD", side: "buy", status: "closed", volume: 0.5, open_price: 2321.4, close_price: 2338.7, profit: 865, opened_at: "2026-09-10T08:30:00Z", closed_at: "2026-09-10T12:45:00Z" },
  { id: "d2", symbol: "EURUSD", side: "sell", status: "closed", volume: 1, open_price: 1.1114, close_price: 1.1078, profit: 360, opened_at: "2026-09-11T09:15:00Z", closed_at: "2026-09-11T14:10:00Z" },
  { id: "d3", symbol: "NAS100", side: "buy", status: "closed", volume: 0.2, open_price: 23010, close_price: 22875, profit: -270, opened_at: "2026-09-12T13:10:00Z", closed_at: "2026-09-12T15:24:00Z" },
  { id: "d4", symbol: "GBPJPY", side: "buy", status: "closed", volume: 0.5, open_price: 199.42, close_price: 200.08, profit: 330, opened_at: "2026-09-14T07:52:00Z", closed_at: "2026-09-14T11:32:00Z" },
  { id: "d5", symbol: "BTCUSD", side: "sell", status: "open", volume: 0.1, open_price: 114250, close_price: null, profit: -42, opened_at: "2026-09-17T18:05:00Z", closed_at: null },
];

export function JournalDashboard({ user, onOpenNotes }: { user: User | null; onOpenNotes: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeReady, setBridgeReady] = useState<boolean | null>(null);
  const autoSyncedAccounts = useRef(new Set<string>());
  const [form, setForm] = useState({ name: "Primary account", login: "", password: "", server: "", platform: "mt5" as "mt4" | "mt5" });
  const getStatus = useServerFn(getBrokerBridgeStatus);
  const connect = useServerFn(connectMetaTrader);
  const sync = useServerFn(syncMetaTrader);
  const disconnect = useServerFn(disconnectMetaTrader);
  const retryDeploy = useServerFn(retryDeployment);

  const loadJournal = async () => {
    if (!user) return;
    const [accountResult, tradeResult] = await Promise.all([
      supabase.from("trading_accounts").select("id,account_name,login,server_name,platform,currency,status,last_synced_at").order("created_at", { ascending: false }),
      supabase.from("trades").select("id,symbol,side,status,volume,open_price,close_price,profit,opened_at,closed_at").order("opened_at", { ascending: false }),
    ]);
    if (accountResult.error || tradeResult.error) throw accountResult.error ?? tradeResult.error;
    setAccounts((accountResult.data ?? []) as Account[]);
    setTrades((tradeResult.data ?? []) as Trade[]);
  };

  useEffect(() => {
    getStatus().then((result) => setBridgeReady(result.configured)).catch(() => setBridgeReady(false));
  }, [getStatus]);

  useEffect(() => {
    loadJournal().catch(() => toast.error("Couldn't load the trading journal."));
  }, [user]);

  useEffect(() => {
    if (!user || !bridgeReady) return;
    const active = accounts.filter((account) => account.status !== "disconnected");
    const refresh = async () => {
      for (const account of active) {
        try {
          await sync({ data: { accountId: account.id } });
          autoSyncedAccounts.current.add(account.id);
        } catch {
          // The account card shows the failed state after the next refresh.
        }
      }
      if (active.length > 0) await loadJournal();
    };
    if (active.some((account) => !autoSyncedAccounts.current.has(account.id))) void refresh();
    const timer = window.setInterval(() => void refresh(), 300_000);
    return () => window.clearInterval(timer);
  }, [accounts, bridgeReady, sync, user]);

  const shownTrades = trades.length > 0 ? trades : demoTrades;
  const isDemo = trades.length === 0;
  const filtered = shownTrades.filter((trade) => trade.symbol.toLowerCase().includes(query.toLowerCase()));
  const stats = useMemo(() => {
    const closed = shownTrades.filter((trade) => trade.status === "closed");
    const wins = closed.filter((trade) => trade.profit > 0);
    const grossWin = wins.reduce((sum, trade) => sum + trade.profit, 0);
    const grossLoss = Math.abs(closed.filter((trade) => trade.profit < 0).reduce((sum, trade) => sum + trade.profit, 0));
    return {
      pnl: closed.reduce((sum, trade) => sum + trade.profit, 0),
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? grossWin : 0,
      open: shownTrades.filter((trade) => trade.status === "open").length,
    };
  }, [shownTrades]);
  const equity = useMemo(() => {
    let total = 0;
    return [...shownTrades].filter((trade) => trade.status === "closed").reverse().map((trade, index) => ({ name: String(index + 1), value: (total += trade.profit) }));
  }, [shownTrades]);

  const handleConnect = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await connect({ data: form });
      if (!result.ok) {
        setBridgeReady(false);
        toast.error("Add the MetaApi token to activate live MetaTrader connections.");
        return;
      }
      setDialogOpen(false);
      if (result.warning) {
        toast.error(result.warning);
        await loadJournal();
        return;
      }
      toast.success("Account connected. Starting the first import…");
      await sync({ data: { accountId: result.accountId } });
      await loadJournal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't connect that account.");
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async (accountId: string) => {
    setBusy(true);
    try {
      const result = await sync({ data: { accountId } });
      if (!result.ok) {
        await loadJournal();
        return toast.error(result.reason === "not_ready" ? result.message : "The MetaApi token is not configured yet.");
      }
      await loadJournal();
      toast.success(`${result.imported} trades synchronized`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed.");
    } finally { setBusy(false); }
  };

  const handleRetryDeploy = async (accountId: string) => {
    setBusy(true);
    try {
      const result = await retryDeploy({ data: { accountId } });
      await loadJournal();
      if (!result.ok) return toast.error("reason" in result ? "The MetaApi token is not configured yet." : result.message);
      toast.success("Redeployment requested. It may take a minute to reconnect.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't retry deployment.");
    } finally { setBusy(false); }
  };

  const handleDisconnect = async (accountId: string) => {
    setBusy(true);
    try {
      await disconnect({ data: { accountId } });
      await loadJournal();
      toast.success("Account disconnected");
    } catch { toast.error("Couldn't disconnect the account."); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="data-label">Trading journal</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Performance command center</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onOpenNotes}>Open notes</Button>
          {user ? (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild><Button><Link2 /> Connect MT4 / MT5</Button></DialogTrigger>
              <DialogContent className="surface-card border-border sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Connect MetaTrader</DialogTitle>
                  <DialogDescription>Use your read-only investor password when your broker supports it. Credentials go directly to MetaApi and are never saved here.</DialogDescription>
                </DialogHeader>
                {bridgeReady === false && <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Live connections need the MetaApi project token. The dashboard remains in sample mode until it is added.</div>}
                <div className="grid gap-3">
                  <Input aria-label="Account name" placeholder="Account name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <Input aria-label="MetaTrader login" placeholder="MetaTrader login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
                  <Input aria-label="Broker server" placeholder="Broker server, e.g. ICMarketsSC-Live" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} />
                  <Select value={form.platform} onValueChange={(value: "mt4" | "mt5") => setForm({ ...form, platform: value })}>
                    <SelectTrigger aria-label="Platform"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="mt5">MetaTrader 5</SelectItem><SelectItem value="mt4">MetaTrader 4</SelectItem></SelectContent>
                  </Select>
                  <Input aria-label="Investor password" type="password" placeholder="Investor password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <DialogFooter><Button onClick={handleConnect} disabled={busy || !form.login || !form.server || !form.password}>{busy ? "Connecting…" : "Connect account"}</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          ) : <Button asChild><Link to="/auth">Sign in to connect</Link></Button>}
        </div>
      </div>

      {isDemo && <div className="flex items-center justify-between gap-3 border-y border-border bg-primary/5 px-4 py-3 text-sm"><span><strong className="text-primary">Sample data</strong><span className="text-muted-foreground"> — connect MetaTrader to replace it with your live journal.</span></span></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Net P&L" value={`${stats.pnl >= 0 ? "+" : "-"}$${Math.abs(stats.pnl).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} accent />
        <Metric label="Win rate" value={`${stats.winRate.toFixed(1)}%`} />
        <Metric label="Profit factor" value={stats.profitFactor.toFixed(2)} />
        <Metric label="Open trades" value={String(stats.open)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="surface-card min-h-80 p-5 sm:p-6">
          <p className="data-label text-primary">Equity curve</p>
          <div className="mt-5 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <defs><linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.34}/><stop offset="100%" stopColor="var(--primary)" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/>
                <XAxis dataKey="name" hide/><YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6 }} formatter={(value) => [`$${Number(value).toFixed(2)}`, "Equity"]}/>
                <Area type="stepAfter" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill="url(#equityFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <div className="space-y-4">
          <section className="surface-card p-5">
            <div className="flex items-center justify-between"><p className="data-label text-primary">Active adapters</p><WalletCards className="size-4 text-muted-foreground" /></div>
            {accounts.length ? accounts.map((account) => (
              <div key={account.id} className="mt-4 border-t border-border pt-4">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{account.account_name}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{account.login} · {account.platform.toUpperCase()}</p></div><span className="status-dot text-[10px] uppercase text-success">{account.status}</span></div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => handleSync(account.id)} disabled={busy}><RefreshCw /> Sync</Button>
                  {account.status === "failed" && <Button size="sm" variant="outline" onClick={() => handleRetryDeploy(account.id)} disabled={busy}>Retry deploy</Button>}
                  <Button size="icon" variant="ghost" aria-label="Disconnect account" onClick={() => handleDisconnect(account.id)} disabled={busy}><Unplug /></Button>
                </div>
              </div>
            )) : <p className="mt-4 text-sm text-muted-foreground">No live account connected.</p>}
          </section>
          <section className="surface-card p-5">
            <p className="data-label text-primary">Asset class</p>
            <div className="mt-6 flex items-center gap-5"><div className="asset-ring"/><div className="space-y-3 text-xs"><p><span className="mr-2 inline-block size-2 rounded-full bg-primary"/>Forex</p><p><span className="mr-2 inline-block size-2 rounded-full bg-success"/>Indices & crypto</p></div></div>
          </section>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="data-label">Trade history</p><h2 className="mt-2 text-2xl font-semibold">Recent executions</h2></div><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" placeholder="Search symbol" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
        <div className="mt-4 overflow-hidden border-y border-border">
          <div className="hidden grid-cols-[1fr_.7fr_.7fr_1fr_1fr] gap-3 border-b border-border px-4 py-3 text-[10px] uppercase text-muted-foreground md:grid"><span>Symbol</span><span>Side</span><span>Volume</span><span>Opened</span><span className="text-right">P&L</span></div>
          {filtered.map((trade) => <div key={trade.id} className="grid grid-cols-2 gap-2 border-b border-border/70 px-4 py-4 text-sm md:grid-cols-[1fr_.7fr_.7fr_1fr_1fr] md:items-center"><strong>{trade.symbol}</strong><span className={trade.side === "buy" ? "text-success" : "text-warning"}>{trade.side.toUpperCase()}</span><span className="text-muted-foreground">{trade.volume}</span><span className="text-xs text-muted-foreground">{new Date(trade.opened_at).toLocaleDateString()}</span><strong className={`text-right ${trade.profit >= 0 ? "text-success" : "text-destructive"}`}>{trade.profit >= 0 ? "+" : "-"}${Math.abs(trade.profit).toFixed(2)}</strong></div>)}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`metric-card ${accent ? "metric-card-accent" : ""}`}><p className="data-label">{label}</p><p className={`mt-3 font-mono text-2xl font-semibold sm:text-4xl ${accent ? "text-primary" : "text-foreground"}`}>{value}</p></div>;
}