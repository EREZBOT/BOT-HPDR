const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

async function getCurrentPrice(symbol) {
  const res = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${symbol}`);
  const data = await res.json();
  return parseFloat(data[0]?.last || 0);
}

async function getOpenTrades() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?status=eq.open`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
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

export async function GET() {
  try {
    const trades = await getOpenTrades();
    let updated = 0;

    for (const trade of trades) {
      const currentPrice = await getCurrentPrice(trade.contract);
      if (!currentPrice) continue;

      const isLong = trade.direction === 'long';
      const pnl = isLong
        ? (currentPrice - trade.entry_price) * trade.size
        : (trade.entry_price - currentPrice) * trade.size;

      let status = 'open';
      let closeReason = null;

      if (isLong && currentPrice <= trade.sl_price
