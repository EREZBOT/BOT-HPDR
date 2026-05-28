export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const EQUITY_START = 1000;

async function getPrice(contract) {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`
  );
  const data = await res.json();
  return parseFloat(data[0]?.last || 0);
}

export async function POST(req) {
  try {
    const { id } = await req.json();
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    // Fetch the trade
    const tradeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/trades?id=eq.${id}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await tradeRes.json();
    const trade = rows[0];
    if (!trade) return Response.json({ error: 'Trade not found' }, { status: 404 });
    if (trade.status !== 'open') return Response.json({ error: 'Trade already closed' }, { status: 400 });

    const price = await getPrice(trade.contract);
    if (!price) return Response.json({ error: 'Could not fetch price' }, { status: 500 });

    const entry = parseFloat(trade.entry_price);
    const isLong = trade.direction === 'long';
    const pnlUsdt = isLong
      ? (price - entry) * trade.size
      : (entry - price) * trade.size;
    const pnlPct = (pnlUsdt / EQUITY_START) * 100;

    await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        status: 'closed',
        exit_price: price,
        close_reason: 'manual',
        pnl_usdt: pnlUsdt,
        pnl_pct: pnlPct,
        current_price: price,
        closed_at: new Date().toISOString(),
      }),
    });

    console.log(`[HPDR] Manual close: ${trade.contract} @ ${price}, PnL: ${pnlUsdt.toFixed(2)}`);
    return Response.json({ success: true, exit_price: price, pnl_usdt: pnlUsdt });
  } catch (err) {
    console.error('[HPDR] Close error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
