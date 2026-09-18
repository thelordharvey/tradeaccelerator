CREATE TABLE public.trading_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'metaapi',
  external_account_id text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  login text NOT NULL DEFAULT '',
  server_name text NOT NULL DEFAULT '',
  platform text NOT NULL CHECK (platform IN ('mt4', 'mt5')),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'connecting' CHECK (status IN ('connecting', 'deploying', 'syncing', 'connected', 'failed', 'disconnected')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_account_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_accounts TO authenticated;
GRANT ALL ON public.trading_accounts TO service_role;

ALTER TABLE public.trading_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trading accounts"
ON public.trading_accounts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trading accounts"
ON public.trading_accounts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trading accounts"
ON public.trading_accounts FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trading accounts"
ON public.trading_accounts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX trading_accounts_user_id_idx ON public.trading_accounts (user_id);

CREATE TRIGGER update_trading_accounts_updated_at
BEFORE UPDATE ON public.trading_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trading_account_id uuid NOT NULL REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  external_trade_id text NOT NULL,
  position_id text,
  symbol text NOT NULL,
  asset_class text NOT NULL DEFAULT 'forex',
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  volume numeric NOT NULL DEFAULT 0,
  open_price numeric,
  close_price numeric,
  stop_loss numeric,
  take_profit numeric,
  commission numeric NOT NULL DEFAULT 0,
  swap numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trading_account_id, external_trade_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades"
ON public.trades FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades"
ON public.trades FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades"
ON public.trades FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades"
ON public.trades FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX trades_user_opened_at_idx ON public.trades (user_id, opened_at DESC);
CREATE INDEX trades_account_status_idx ON public.trades (trading_account_id, status);

CREATE TRIGGER update_trades_updated_at
BEFORE UPDATE ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.note_trade_links (
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, trade_id)
);

GRANT SELECT, INSERT, DELETE ON public.note_trade_links TO authenticated;
GRANT ALL ON public.note_trade_links TO service_role;

ALTER TABLE public.note_trade_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own note trade links"
ON public.note_trade_links FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own note trade links"
ON public.note_trade_links FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own note trade links"
ON public.note_trade_links FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX note_trade_links_user_id_idx ON public.note_trade_links (user_id);