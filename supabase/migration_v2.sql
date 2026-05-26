-- HPDR Bot — Migration v2
-- Run this in Supabase SQL Editor if the trades table already exists
-- Safe to run multiple times (IF NOT EXISTS)

ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_price NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stage         INTEGER DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS closed_at     TIMESTAMPTZ;

-- Backfill stage = 0 for existing rows
UPDATE trades SET stage = 0 WHERE stage IS NULL;

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trades'
ORDER BY ordinal_position;
