# TradingView → HPDR Bot Setup

## Step 1 — Open the chart

Open BTCUSDT.P (or ETHUSDT.P) on the Daily timeframe with the HPDR indicator active.

---

## Step 2 — Create the Alert

Click the bell icon (⏰) → **Create Alert**

| Setting | Value |
|---------|-------|
| Condition | HPDR Strategy — alert() function calls only |
| Expiration | Open-ended |
| Alert name | HPDR LONG BTC (or SHORT / ETH) |

---

## Step 3 — Webhook Message

In the **Message** field paste the appropriate JSON:

### LONG signal:
```json
{"action":"long","symbol":"{{ticker}}","sl_pct":2.5,"price":{{close}}}
```

### SHORT signal:
```json
{"action":"short","symbol":"{{ticker}}","sl_pct":2.5,"price":{{close}}}
```

### With monthly levels (recommended for accurate TP targets):
```json
{"action":"long","symbol":"{{ticker}}","sl_pct":2.5,"price":{{close}},"tp1_price":MONTHLY_MID,"tp2_price":MONTHLY_HIGH}
```
```json
{"action":"short","symbol":"{{ticker}}","sl_pct":2.5,"price":{{close}},"tp1_price":MONTHLY_MID,"tp2_price":MONTHLY_LOW}
```

> **Note:** Replace `MONTHLY_MID`, `MONTHLY_HIGH`, `MONTHLY_LOW` with the actual Pine Script variable names from the HPDR indicator (e.g. `{{plot_0}}`).  
> If omitted, the bot defaults to ±2.5% (TP1) and ±5% (TP2) from entry.

---

## Step 4 — Webhook URL

In the **Webhook URL** field enter:
```
https://bot-hpdr.vercel.app/api/webhook
```

---

## Step 5 — Add the Secret Header

TradingView does not support custom headers natively, so add the secret as a query parameter instead.  
In the Webhook URL field use:
```
https://bot-hpdr.vercel.app/api/webhook?secret=YOUR_WEBHOOK_SECRET
```

Then in `api/webhook.js`, the validation also accepts `?secret=` from the query string:
> The current code checks the `x-webhook-secret` header. If TradingView cannot send headers, update the webhook to also accept a `secret` query param (see note below).

---

## Step 6 — Repeat for each symbol / direction

Create **4 alerts** total:

| Alert | Symbol | Action |
|-------|--------|--------|
| HPDR LONG BTC  | BTCUSDT.P | long  |
| HPDR SHORT BTC | BTCUSDT.P | short |
| HPDR LONG ETH  | ETHUSDT.P | long  |
| HPDR SHORT ETH | ETHUSDT.P | short |

---

## Notes

- Requires TradingView **Essential** plan or higher for Webhooks
- `{{ticker}}` is sent automatically by TradingView — do not change it
- `{{close}}` is the closing price of the candle — do not change it
- The bot converts `BTCUSDT.P` → `BTC_USDT` (Gate.io format) automatically
- Only **one open trade per symbol** is allowed — duplicate signals are rejected
