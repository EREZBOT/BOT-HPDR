export const dynamic = 'force-dynamic';

// Convert Gate.io contract name to Binance symbol, e.g. BTC_USDT -> BTCUSDT
function toBinanceSymbol(contract) {
  return contract.replace('_', '');
}

async function fetchGateio(contract) {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`
  );
  const data = await res.json();
  const last = parseFloat(data[0]?.last);
  return isNaN(last) ? null : last;
}

async function fetchBinance(contract) {
  const symbol = toBinanceSymbol(contract);
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`
  );
  const data = await res.json();
  const price = parseFloat(data?.price);
  return isNaN(price) ? null : price;
}

export async function GET(req) {
  try {
    const contracts = new URL(req.url).searchParams.get('contracts') || '';
    const list = contracts.split(',').map(s => s.trim()).filter(Boolean);

    if (list.length === 0) {
      return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
    }

    const prices = {};
    let source = 'gateio';

    await Promise.all(list.map(async (contract) => {
      try {
        const gatePrice = await fetchGateio(contract);
        if (gatePrice !== null) {
          prices[contract] = gatePrice;
          return;
        }
      } catch (err) {
        console.error(`[prices] Gate.io ${contract}:`, err.message);
      }

      // Fallback to Binance Futures
      try {
        const binancePrice = await fetchBinance(contract);
        if (binancePrice !== null) {
          prices[contract] = binancePrice;
          source = 'binance';
          return;
        }
      } catch (err) {
        console.error(`[prices] Binance ${contract}:`, err.message);
      }

      prices[contract] = null;
    }));

    // Determine actual source used
    const allNull = list.every(c => prices[c] === null);
    const anyBinance = list.some(c => prices[c] !== null) && source === 'binance';
    const resolvedSource = allNull ? 'none' : anyBinance ? 'binance' : 'gateio';

    return Response.json(
      { ...prices, _source: resolvedSource },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[prices] Fatal:', err.message);
    return Response.json({ _error: err.message }, { status: 500 });
  }
}
