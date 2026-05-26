-- HPDR Bot - Supabase Schema

-- ── Trades Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id              SERIAL PRIMARY KEY,
  contract        TEXT NOT NULL,          -- e.g. BTC_USDT
  direction       TEXT NOT NULL,          -- 'long' | 'short'
  entry_price     NUMERIC NOT NULL,
  size            INTEGER NOT NULL,       -- number of contracts
  sl_price        NUMERIC,

  -- TP levels
  tp1_price       NUMERIC,               -- monthly mid / first target
  tp2_price       NUMERIC,               -- opposite monthly range / second target

  -- Live tracking
  current_price   NUMERIC,               -- updated by monitor every minute
  exit_price      NUMERIC,               -- actual exit price when closed

  -- P&L
  pnl_usdt        NUMERIC DEFAULT 0,
  pnl_pct         NUMERIC DEFAULT 0,     -- % of equity

  -- Status
  status          TEXT DEFAULT 'open',   -- 'open' | 'closed'
  close_reason    TEXT,                  -- 'tp1' | 'tp2' | 'sl' | 'manual'
  stage           INTEGER DEFAULT 0,     -- 0 = before TP1, 1 = after TP1 (SL at BE)

  -- Gate.io order ID (for live mode)
  gate_order_id   TEXT,

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_status   ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_contract ON trades(contract);
CREATE INDEX IF NOT EXISTS idx_trades_created  ON trades(created_at DESC);

-- ── Stats View ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW trade_stats AS
SELECT
  COUNT(*)                                           AS total_trades,
  COUNT(*) FILTER (WHERE status = 'open')            AS open_trades,
  COUNT(*) FILTER (WHERE pnl_usdt > 0)               AS winning_trades,
  COUNT(*) FILTER (WHERE pnl_usdt < 0)               AS losing_trades,
  ROUND(SUM(pnl_usdt)::NUMERIC, 2)                   AS total_pnl,
  ROUND(AVG(pnl_usdt)::NUMERIC, 2)                   AS avg_pnl,
  ROUND(
    (COUNT(*) FILTER (WHERE pnl_usdt > 0)::FLOAT /
     NULLIF(COUNT(*) FILTER (WHERE status = 'closed'), 0) * 100)::NUMERIC, 1
  )                                                  AS win_rate_pct
FROM trades;

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service" ON trades
  FOR ALL USING (true);

-- ── Migration: run these if table already exists ───────────────────────────────
-- ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_price NUMERIC;
-- ALTER TABLE trades ADD COLUMN IF NOT EXISTS stage INTEGER DEFAULT 0;
-- ALTER TABLE trades ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
