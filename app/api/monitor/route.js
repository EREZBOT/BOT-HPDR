export const dynamic = 'force-dynamic';

import { fetchAllPrices } from '../../../lib/prices.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
// FIX 4: CRON_SECRET is read here for monitor authentication (see GET handler below).
const CRON_SECRET = process.env.CRON_SECRET;

const EQUITY = 1000;
// Process at most this many trades per cron run. The price fetch and the
// per-trade Supabase PATCH are network calls; without a cap a backlog of
// hundreds of open trades runs the serverless function past its timeout and
// NOTHING gets updated. Oldest-first ordering rotates every trade through.
const BATCH_LIMIT = 30;

async function getSettings() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_settings?id=eq.1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: 'no-store',
    });
    const data = await res.json();
    return data?.[0] ?? { use_sl: false };
  } catch {
    return { use_sl: false };
  }
}

async function getOpenTrades() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/trades?status=eq.open&order=created_at.asc&limit=${BATCH_LIMIT}`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  return res.json();
}

async function updateTrade(id, updates) {
  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(updates),
  });
}

async function closeTrade(id, exitPrice, closeReason, pnlUsdt, pnlPct) {
  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
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

export async function GET(req) {
  // ── FIX 4: CRON_SECRET authentication ────────────────────────────────────────
  // Vercel automatically injects `Authorization: Bearer <CRON_SECRET>` on every
  // cron invocation when CRON_SECRET is set in the project's environment variables.
  // Any direct external HTTP call that lacks this header is rejected with 401.
  // If CRON_SECRET is not set (local dev), the check is skipped so dev workflows
  // are not broken.
  if (CRON_SECRET) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      console.warn('[HPDR] Monitor: unauthorized call rejected');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const trades = await getOpenTrades();

    if (!Array.isArray(trades) || trades.length === 0) {
      return Response.json({ checked: 0, updated: 0 });
    }

    // Fetch every unique contract's price ONCE, in parallel, using the
    // multi-source fetcher (Gate.io blocks Vercel's IP, so the fallbacks
    // Bybit/OKX/CryptoCompare are what actually return a price here).
    const { prices, sources, diag } = await fetchAllPrices(trades.map(t => t.contract));
    const settings = await getSettings();

    let updated = 0;
    const skipped = [];

    for (const trade of trades) {
      const price = prices[trade.contract];
      if (!price) {
        console.warn(`[HPDR] No price for ${trade.contract}:`, diag[trade.contract]);
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

      // Stop loss hit
      if (settings.use_sl && sl && ((isLong && price <= sl) || (!isLong && price >= sl))) {
        const slPnl = isLong ? (sl - entry) * trade.size : (entry - sl) * trade.size;
        const slPct = (slPnl / EQUITY) * 100;
        await closeTrade(trade.id, sl, 'sl', slPnl, slPct);
        console.log(`[HPDR] SL hit: ${trade.contract} @ ${sl}, PnL: ${slPnl.toFixed(2)}`);
        updated++;
        continue;
      }

      // TP1 — close 50% of position, move SL to break even
      if (stage === 0 && trade.tp1_price) {
        const tp1 = parseFloat(trade.tp1_price);
        if ((isLong && price >= tp1) || (!isLong && price <= tp1)) {

          // ── FIX 3: zombie trade guard ───────────────────────────────────────
          // BEFORE: `Math.floor(trade.size / 2) || 1`
          //   When size=1: floor(0.5)=0, then 0||1=1 (half = full position).
          //   remainingSize = 1-1 = 0 → trade stuck open forever with 0 contracts.
          //
          // AFTER: compute halfSize without the || 1 fallback.
          //   When halfSize===0 (size=1), close the FULL position at TP1 price
          //   immediately instead of creating a zombie trade.
          const halfSize = Math.floor(trade.size / 2);

          if (halfSize === 0) {
            // size = 1: cannot split. Close fully at TP1 price.
            const tp1Pnl = isLong
              ? (tp1 - entry) * trade.size
              : (entry - tp1) * trade.size;
            const tp1Pct = (tp1Pnl / EQUITY) * 100;
            await closeTrade(trade.id, tp1, 'tp1', tp1Pnl, tp1Pct);
            console.log(`[HPDR] TP1 full close (size=1): ${trade.contract} @ ${tp1}, PnL: ${tp1Pnl.toFixed(2)}`);
            updated++;
            continue;
          }

          // Normal partial close: size >= 2, halfSize >= 1.
          const remainingSize = trade.size - halfSize;
          // Store only the REALIZED partial PnL (the halfSize contracts closed at tp1).
          // Previously stored realized + unrealized combined, which is stale on next tick.
          const tp1Pnl = isLong
            ? (tp1 - entry) * halfSize
            : (entry - tp1) * halfSize;
          await updateTrade(trade.id, {
            stage: 1,
            size: remainingSize,
            sl_price: entry,       // SL moves to break-even
            current_price: price,
            pnl_usdt: tp1Pnl,
            pnl_pct: (tp1Pnl / EQUITY) * 100,
          });
          console.log(`[HPDR] TP1 hit: ${trade.contract} @ ${tp1} — 50% closed (${halfSize} cts), SL → BE, remaining: ${remainingSize} cts`);
          updated++;
          continue;
        }
      }

      // TP2 — close remaining position
      if (stage >= 1 && trade.tp2_price) {
        const tp2 = parseFloat(trade.tp2_price);
        if ((isLong && price >= tp2) || (!isLong && price <= tp2)) {
          await closeTrade(trade.id, price, 'tp2', pnlUsdt, pnlPct);
          console.log(`[HPDR] TP2 hit: ${trade.contract} @ ${price}, PnL: ${pnlUsdt.toFixed(2)}`);
          updated++;
          continue;
        }
      }

      await updateTrade(trade.id, { current_price: price, pnl_usdt: pnlUsdt, pnl_pct: pnlPct });
      updated++;
    }

    return Response.json({ checked: trades.length, updated, sources, skipped });
  } catch (err) {
    console.error('[HPDR] Monitor error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
