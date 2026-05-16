const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function saveTrade(trade) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(trade),
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

async function getOpenTrades() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?status=eq.open`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, symbol, sl_pct = 2.5, price, tp1, tp2, tp3 } = body;

    if (!action || !symbol || !price) {
      return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const currentPrice = parseFloat(price);
    const isLong = action === 'long';
    const slPrice = isLong
      ? currentPrice * (1 - sl_pct / 100)
      : currentPrice * (1 + sl_pct / 100);

    // השתמש ב-TP מהבנד האמיתי אם נשלח, אחרת חשב לפי אחוזים
    const tp1Price = tp1 ? parseFloat(tp1) : isLong ? currentPrice * 1.015 : currentPrice * 0.985;
    const tp2Price = tp2 ? parseFloat(tp2) : isLong ? currentPrice * 1.025 : currentPrice * 0.975;
    const tp3Price = tp3 ? parseFloat(tp3) : isLong ? currentPrice * 1.04 : currentPrice * 0.96;

    const trade = {
      contract: symbol,
      direction: action,
      entry_price: currentPrice,
      size: 1,
      sl_price: slPrice,
      tp1_price: tp1Price,
      tp2_price: tp2Price,
      tp3_price: tp3Price,
      status: 'open',
      stage: 0,
      pnl_usdt: 0,
      pnl_pct: 0,
    };

    const saved = await saveTrade(trade);
    return Response.json({ success: true, trade: saved });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  // בדיקת TP/SL לכל הטריידים הפתוחים
  try {
    const trades = await getOpenTrades();
    if (!Array.isArray(trades)) return Response.json({ checked: 0 });

    let closed = 0;

    for (const trade of trades) {
      const entry = parseFloat(trade.entry_price);
      const tp1 = parseFloat(trade.tp1_price);
      const tp2 = parseFloat(trade.tp2_price);
      const tp3 = parseFloat(trade.tp3_price);
      const sl = parseFloat(trade.sl_price);
      const isLong = trade.direction === 'long';
      const stage = trade.stage || 0;

      // קבל מחיר נוכחי
      let current = 0;
      try {
        const priceRes = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${trade.contract}`);
        const priceData = await priceRes.json();
        current = parseFloat(priceData.price || 0);
      } catch { continue; }

      if (!current) continue;

      const pnlPct = isLong ? ((current - entry) / entry) * 100 : ((entry - current) / entry) * 100;
      const pnlUsdt = pnlPct * entry * trade.size / 100;

      // בדוק SL
      const slHit = isLong ? current <= sl : current >= sl;
      if (slHit) {
        await updateTrade(trade.id, {
          status: 'closed',
          close_reason: 'SL',
          exit_price: current,
          pnl_usdt: pnlUsdt,
          pnl_pct: pnlPct,
          closed_at: new Date().toISOString(),
        });
        closed++;
        continue;
      }

      // בדוק TP1 (stage 0)
      if (stage === 0) {
        const tp1Hit = isLong ? current >= tp1 : current <= tp1;
        if (tp1Hit) {
          await updateTrade(trade.id, {
            stage: 1,
            pnl_usdt: pnlUsdt,
            pnl_pct: pnlPct,
          });
        }
      }

      // בדוק TP2 (stage 1) → SL זז ל-Break Even
      if (stage === 1) {
        const tp2Hit = isLong ? current >= tp2 : current <= tp2;
        if (tp2Hit) {
          await updateTrade(trade.id, {
            stage: 2,
            sl_price: entry, // SL זז ל-Break Even
            pnl_usdt: pnlUsdt,
            pnl_pct: pnlPct,
          });
        }
      }

      // בדוק TP3 (stage 2) → סגור הכל
      if (stage === 2) {
        const tp3Hit = isLong ? current >= tp3 : current <= tp3;
        if (tp3Hit) {
          await updateTrade(trade.id, {
            status: 'closed',
            close_reason: 'TP3',
            exit_price: current,
            pnl_usdt: pnlUsdt,
            pnl_pct: pnlPct,
            closed_at: new Date().toISOString(),
          });
          closed++;
        } else {
          await updateTrade(trade.id, { pnl_usdt: pnlUsdt, pnl_pct: pnlPct });
        }
      }
    }

    return Response.json({ checked: trades.length, closed });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
