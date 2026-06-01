export const dynamic = 'force-dynamic';

import { fetchAllPrices } from '../../../lib/prices.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const EQUITY = 1000;
// Process at most 30 trades per cron run to avoid Vercel function timeout
const BATCH_LIMIT = 30;

async function getOpenTrades() {
  const res = await fetch(
    // Oldest first so every trade eventually rotates through;
    // LIMIT prevents timeout when thousands of stale trades exist
    `${SUPABASE_URL}/rest/v1/trades?status=eq.open&order=created_at.asc&limit=${BATCH_LIMIT}`,
    {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function updateTrade(id, updates) {
  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(updates),
  });
}

async function closeTrade(id, exitPrice, closeReason, pnlUsdt, pnlPct) {
  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      status: 'closed',
      exit_price: exitPrice,
      close_reason: closeReason,
      pnl_usdt: pnlUsdt,
      pnl_pct: pnlPct,
      current_price: exitPrice,
      closed_at: new Date().toISOString(),
    }),
  });
}

export async function GET() {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return Response.json({ error: 'Supabase env vars not set' }, { status: 500 });
    }

    const trades = await getOpenTrades();

    if (!Array.isArray(trades) || trades.length === 0) {
      return Response.json({ checked: 0, updated: 0, closed: 0 });
    }

    // Fetch all prices in parallel — one request per unique contract, not per trade
    const { prices, sources, diag } = await fetchAllPrices(trades.map(t => t.contract));

    let updated = 0;
    let closed = 0;
    const skipped = [];

    for (const trade of trades) {
      const price = prices[trade.contract];
      if (!price) {
        console.warn(`[monitor] No price for ${trade.contract}:`, diag[trade.contract]);
        skipped.push({ contract: trade.contract, errors: diag[trade.contract] });
        continue;
      }

      const isLong = trade.direction === 'long';
      const entry = parseFloat(trade.entry_price);
      const sl = parseFloat(trade.sl_price);
      const stage = trade.stage ?? 0;

      const pnlUsdt = isLong
        ? (price - entry) * trade.size
        : (entry - price) * trade.size;
      const pnlPct = (pnlUsdt / EQUITY) * 100;

      // Stop loss
      if ((isLong && price <= sl) || (!isLong && price >= sl)) {
        const slPnl = isLong ? (sl - entry) * trade.size : (entry - sl) * trade.size;
        const slPct = (slPnl / EQUITY) * 100;
        await closeTrade(trade.id, sl, 'sl', slPnl, slPct);
        console.log(`[monitor] SL: ${trade.contract} @ ${sl} | PnL ${slPnl.toFixed(2)}`);
        closed++;
        updated++;
        continue;
      }

      // TP1 — close 50%, move SL to break-even
      if (stage === 0 && trade.tp1_price) {
        const tp1 = parseFloat(trade.tp1_price);
        if ((isLong && price >= tp1) || (!isLong && price <= tp1)) {
          const halfSize = Math.max(1, Math.floor(trade.size / 2));
          const tp1Pnl = isLong ? (tp1 - entry) * halfSize : (entry - tp1) * halfSize;
          const remainingSize = trade.size - halfSize;
          await updateTrade(trade.id, {
            stage: 1,
            size: remainingSize,
            sl_price: entry,
            current_price: price,
            pnl_usdt: tp1Pnl + (isLong ? (price - entry) : (entry - price)) * remainingSize,
            pnl_pct: ((tp1Pnl + (isLong ? (price - entry) : (entry - price)) * remainingSize) / EQUITY) * 100,
          });
          console.log(`[monitor] TP1: ${trade.contract} @ ${tp1} | 50% closed, SL→BE, rem: ${remainingSize}`);
          updated++;
          continue;
        }
      }

      // TP2 — close remainder
      if (stage >= 1 && trade.tp2_price) {
        const tp2 = parseFloat(trade.tp2_price);
        if ((isLong && price >= tp2) || (!isLong && price <= tp2)) {
          await closeTrade(trade.id, price, 'tp2', pnlUsdt, pnlPct);
          console.log(`[monitor] TP2: ${trade.contract} @ ${price} | PnL ${pnlUsdt.toFixed(2)}`);
          closed++;
          updated++;
          continue;
        }
      }

      // No trigger — update current price and PnL
      await updateTrade(trade.id, { current_price: price, pnl_usdt: pnlUsdt, pnl_pct: pnlPct });
      updated++;
    }

    return Response.json({ checked: trades.length, updated, closed, sources, skipped });
  } catch (err) {
    console.error('[monitor] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
