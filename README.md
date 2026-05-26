# HPDR Bot

Automated paper trading bot for Gate.io USDT Perpetual Futures.
Receives signals from TradingView, tracks trades in Supabase, displays a live dashboard on Vercel.

## Architecture

```
TradingView (Daily HPDR alerts)
        │
        │ Webhook POST /api/webhook
        ▼
Vercel (Next.js)
        │
        ├── /api/webhook   — validates signal, saves trade to Supabase
        ├── /api/monitor   — cron every 1 min: updates PnL, checks SL/TP
        └── /              — live dashboard
        │
        ▼
Supabase (trades table)
```

**Paper mode only** — no real orders are sent to Gate.io.  
Gate.io API is used only to fetch live market prices.

---

## Setup

### 1. Supabase

Run `supabase/schema.sql` in the SQL Editor.

If the `trades` table already exists, run only the migration block at the bottom:
```sql
ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_price NUMERIC;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stage INTEGER DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
```

### 2. Vercel — Environment Variables

| Variable | Description |
|----------|-------------|
| `GATE_API_KEY` | Gate.io API key (BOT0 sub-account) |
| `GATE_SECRET` | Gate.io API secret |
| `SUPABASE_URL` | `https://<project-id>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase service role key |
| `WEBHOOK_SECRET` | Any random string — used to authenticate TradingView |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

### 3. TradingView

See `TRADINGVIEW_SETUP.md` for full instructions.

---

## Trading Strategy (HPDR)

**Entry conditions (Daily timeframe):**
- **LONG** — 2 consecutive daily candles closed *below* the Monthly Low
- **SHORT** — 2 consecutive daily candles closed *above* the Monthly High

**Exit levels:**
| Level | Target | Action |
|-------|--------|--------|
| TP1 | Monthly Mid (50% of range) | Move SL to Break Even |
| TP2 | Monthly High (Long) / Monthly Low (Short) | Close full position |
| SL | 2.5% from entry | Close full position |

**Position sizing (paper mode):**
- Equity: $1,000 fixed
- Risk per trade: 10% = $100
- Leverage: x25
- Formula: `size = floor((riskAmount / sl_pct%) * leverage / price)`

---

## Project Structure

```
hpdr-bot/
├── api/
│   ├── webhook.js          — receives TradingView signals
│   └── monitor.js          — cron: updates PnL, checks SL/TP
├── app/
│   ├── layout.js
│   └── page.js             — live dashboard
├── supabase/
│   └── schema.sql          — DB schema + migration
├── vercel.json             — cron schedule (every 1 min)
├── TRADINGVIEW_SETUP.md
└── README.md
```

---

## Webhook Format

```
POST /api/webhook
Header: x-webhook-secret: <WEBHOOK_SECRET>

Body:
{"action":"long","symbol":"BTCUSDT.P","sl_pct":2.5,"price":95000}
{"action":"short","symbol":"ETHUSDT.P","sl_pct":2.5,"price":3200}

Optional TP levels:
{"action":"long","symbol":"BTCUSDT.P","sl_pct":2.5,"price":95000,"tp1_price":97500,"tp2_price":100000}
```

Symbol conversion: `BTCUSDT.P` → `BTC_USDT`, `ETHUSDT` → `ETH_USDT`

---

## Security

- Never commit `.env.local` to GitHub
- Never share API Keys
- Bot is connected to Gate.io sub-account **BOT0** only — main account funds are isolated
- All webhooks are validated with `WEBHOOK_SECRET`
