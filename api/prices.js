// Server-side proxy for Gate.io prices — avoids browser CORS restrictions
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const contracts = searchParams.get('contracts') || '';
  const list = contracts.split(',').map(s => s.trim()).filter(Boolean);

  if (list.length === 0) {
    return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
  }

  const prices = {};
  await Promise.all(list.map(async (contract) => {
    try {
      const res = await fetch(
        `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`
      );
      const data = await res.json();
      prices[contract] = parseFloat(data[0]?.last || 0);
    } catch {
      prices[contract] = 0;
    }
  }));

  return Response.json(prices, { headers: { 'Cache-Control': 'no-store' } });
}
