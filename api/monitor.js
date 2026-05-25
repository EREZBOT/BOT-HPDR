// HPDR Bot - Monitor v4 Fixed
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function getCurrentPrice(symbol) {
  try {
    const res = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${symbol}`);
    const data = await res.json();
    return parseFloat(data[0]?.last || 0);
  } catch (err) {
    console.error('Price fetch error:', err);
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
      if (!price || price === 0) continue;

      const isLong = trade.direction === 'long';
      const entry = parseFloat(trade.entry_price);
      const sl = parseFloat(trade.sl_price);

      // Calculate PnL
      const pnlPct = isLong
        ? ((price - entry) / entry) * 100
        : ((entry - price) / entry) * 100;
      const pnlUsdt = (pnlPct / 100) * 1000; // Based on $1000 equity

      // Check Stop Loss
      if (isLong && price <= sl) {
        await closeTrade(trade.id, price, 'sl');
        updated++;
        continue;
      }
      if (!isLong && price >= sl) {
        await closeTrade(trade.id, price, 'sl');
        updated++;
        continue;
      }

      // Check TP1 - Mid Range (50%)
      if (trade.stage === 0 && trade.tp1_price) {
        const tp1 = parseFloat(trade.tp1_price);
        if ((isLong && price >= tp1) || (!isLong && price <= tp1)) {
          await updateTrade(trade.id, {
            stage: 1,
            sl_price: entry, // Move SL to Break Even
            current_price: price,
            pnl_usdt: pnlUsdt,
            pnl_pct: pnlPct,
          });
          updated++;
          continue;
        }
      }

      // Check TP2 - Full Close
      if (trade.stage >= 1 && trade.tp2_price) {
        const tp2 = parseFloat(trade.tp2_price);
        if ((isLong && price >= tp2) || (!isLong && price <= tp2)) {
          await closeTrade(trade.id, price, 'tp2');
          updated++;
          continue;
        }
      }

      // Update current price and PnL
      await updateTrade(trade.id, {
        current_price: price,
        pnl_usdt: pnlUsdt,
        pnl_pct: pnlPct,
      });
      updated++;
    }

    return Response.json({ checked: trades.length, updated });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
