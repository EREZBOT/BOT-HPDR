export async function GET(req) {
  try {
    const contracts = new URL(req.url).searchParams.get('contracts') || '';
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
        const last = parseFloat(data[0]?.last);
        prices[contract] = isNaN(last) ? null : last;
      } catch (err) {
        console.error(`[prices] ${contract}:`, err.message);
        prices[contract] = null;
      }
    }));

    return Response.json(prices, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[prices] Fatal:', err.message);
    return Response.json({ _error: err.message }, { status: 500 });
  }
}
