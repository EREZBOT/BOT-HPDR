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

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, symbol, sl_pct = 2.5, price } = body;

    if (!action || !symbol || !price) {
      return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const currentPrice = parseFloat(price);
    const isLong = action === 'long';
    const slPrice = isLong ? currentPrice * (1 - sl_pct / 100) : currentPrice * (1 + sl_pct / 100);
    const tp1Price = isLong ? currentPrice * 1.015 : currentPrice * 0.985;
    const tp2Price = isLong ? currentPrice * 1.025 : currentPrice * 0.975;
    const tp3Price = isLong ? currentPrice * 1.04 : currentPrice * 0.96;

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
      pnl_usdt: 0,
      pnl_pct: 0,
    };

    const saved = await saveTrade(trade);
    return Response.json({ success: true, trade: saved });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
