-- Bot settings (single row, id always = 1)
CREATE TABLE IF NOT EXISTS bot_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  leverage INTEGER NOT NULL DEFAULT 50,
  risk_pct NUMERIC NOT NULL DEFAULT 10,
  use_sl BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO bot_settings (id, leverage, risk_pct, use_sl)
  VALUES (1, 50, 10, false)
  ON CONFLICT (id) DO NOTHING;

-- Sessions archive (each "Start Fresh" saves a row here)
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  total_trades INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
