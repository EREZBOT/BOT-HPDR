const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const EQUITY = 1000;

async function getCurrentPrice(contract) {
  try {
    const res = await fetch(
      `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`
    );
    const data = await res.json();
    return parseFloat(data[0]?.last || 0);
  } catch (err) {
    console.error(`[HPDR] Price fetch error for ${contract}:`, err.message);
    return 0;
  }
}

async function getOpenTrades() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?status=eq.open`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
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

async function closeTrade(id, exitPrice, closeReason) {
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
      closed_at: new Date().toISOString(),
    }),
  });
}

export async function GET() {
  try {
    const trades = await getOpenTrades();

    if (!Array.isArray(trades) || trades.length === 0) {
      return Response.json({ checked: 0, updated: 0 });
    }

    let updated = 0;

    for (const trade of trades) {
      const price = await getCurrentPrice(trade.contract);
      if (!price) continue;

      const isLong = trade.direction === 'long';
      const entry = parseFloat(trade.entry_price);
      const sl = parseFloat(trade.sl_price);
      const stage = trade.stage ?? 0;

      // PnL based on actual position size (paper mode)
      const pnlUsdt = isLong
        ? (price - entry) * trade.size
        : (entry - price) * trade.size;
      const pnlPct = (pnlUsdt / EQUITY) * 100;

      // Stop loss hit
      if ((isLong && price <= sl) || (!isLong && price >= sl)) {
        const slPnl = isLong
          ? (sl - entry) * trade.size
          : (entry - sl) * trade.size;
        await closeTrade(trade.id, price, 'sl');
        console.log(`[HPDR] SL hit: ${trade.contract} @ ${price}, PnL: ${slPnl.toFixed(2)}`);
        updated++;
        continue;
      }

      // TP1 — move SL to break even
      if (stage === 0 && trade.tp1_price) {
        const tp1 = parseFloat(trade.tp1_price);
        if ((isLong && price >= tp1) || (!isLong && price <= tp1)) {
          await updateTrade(trade.id, {
            stage: 1,
            sl_price: entry,
            current_price: price,
            pnl_usdt: pnlUsdt,
            pnl_pct: pnlPct,
          });
          console.log(`[HPDR] TP1 hit: ${trade.contract} @ ${price} — SL moved to break even`);
          updated++;
          continue;
        }
      }

      // TP2 — full close
      if (stage >= 1 && trade.tp2_price) {
        const tp2 = parseFloat(trade.tp2_price);
        if ((isLong && price >= tp2) || (!isLong && price <= tp2)) {
          await closeTrade(trade.id, price, 'tp2');
          console.log(`[HPDR] TP2 hit: ${trade.contract} @ ${price}, PnL: ${pnlUsdt.toFixed(2)}`);
          updated++;
          continue;
        }
      }

      // Update live price and PnL
      await updateTrade(trade.id, {
        current_price: price,
        pnl_usdt: pnlUsdt,
        pnl_pct: pnlPct,
      });
      updated++;
    }

    return Response.json({ checked: trades.length, updated });
  } catch (err) {
    console.error('[HPDR] Monitor error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
