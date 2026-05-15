-- HPDR Bot - Supabase Schema
-- הרץ את הקוד הזה ב-SQL Editor של Supabase

-- ── Trades Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id              SERIAL PRIMARY KEY,
  contract        TEXT NOT NULL,          -- e.g. BTC_USDT
  direction       TEXT NOT NULL,          -- 'long' | 'short'
  entry_price     NUMERIC NOT NULL,
  size            INTEGER NOT NULL,       -- number of contracts
  sl_price        NUMERIC,               -- stop loss price
  
  -- Exit prices (filled as trade progresses)
  tp1_price       NUMERIC,               -- median
  tp2_price       NUMERIC,               -- 61.8%
  tp3_price       NUMERIC,               -- 88.3%
  exit_price      NUMERIC,               -- actual exit price
  
  -- P&L
  pnl_usdt        NUMERIC DEFAULT 0,
  pnl_pct         NUMERIC DEFAULT 0,
  
  -- Status
  status          TEXT DEFAULT 'open',   -- 'open' | 'closed' | 'sl_hit'
  close_reason    TEXT,                  -- 'tp1' | 'tp2' | 'tp3' | 'sl' | 'manual'
  
  -- Gate.io order IDs
  gate_order_id   TEXT,
  
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_status    ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_contract  ON trades(contract);
CREATE INDEX IF NOT EXISTS idx_trades_created   ON trades(created_at DESC);

-- ── Stats View ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW trade_stats AS
SELECT
  COUNT(*)                                          AS total_trades,
  COUNT(*) FILTER (WHERE status = 'open')           AS open_trades,
  COUNT(*) FILTER (WHERE pnl_usdt > 0)              AS winning_trades,
  COUNT(*) FILTER (WHERE pnl_usdt < 0)              AS losing_trades,
  ROUND(SUM(pnl_usdt)::NUMERIC, 2)                  AS total_pnl,
  ROUND(AVG(pnl_usdt)::NUMERIC, 2)                  AS avg_pnl,
  ROUND(
    (COUNT(*) FILTER (WHERE pnl_usdt > 0)::FLOAT / 
     NULLIF(COUNT(*) FILTER (WHERE status = 'closed'), 0) * 100)::NUMERIC, 1
  )                                                 AS win_rate_pct
FROM trades;

-- Enable Row Level Security
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Allow all operations with service key
CREATE POLICY "Allow all for service" ON trades
  FOR ALL USING (true);
