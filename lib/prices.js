// Multi-exchange price fetcher for USDT perpetuals.
// Tries several public APIs because some exchanges (Binance, sometimes
// Gate.io) return 451/403 from datacenter IPs like Vercel's. Order is
// chosen so the most cloud-friendly sources come first.
//
// `contract` is the Gate.io style symbol, e.g. "ETH_USDT".

const TIMEOUT = 4000;

function withTimeout() {
  // AbortSignal.timeout isn't available in every runtime; guard it.
  try {
    return AbortSignal.timeout(TIMEOUT);
  } catch {
    return undefined;
  }
}

async function fromGateio(contract) {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`,
    { signal: withTimeout() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const p = parseFloat(data?.[0]?.last);
  return isNaN(p) ? null : p;
}

async function fromBybit(contract) {
  const symbol = contract.replace('_', ''); // ETH_USDT -> ETHUSDT
  const res = await fetch(
    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    { signal: withTimeout() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const p = parseFloat(data?.result?.list?.[0]?.lastPrice);
  return isNaN(p) ? null : p;
}

async function fromOkx(contract) {
  const instId = contract.replace('_', '-') + '-SWAP'; // ETH_USDT -> ETH-USDT-SWAP
  const res = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
    { signal: withTimeout() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const p = parseFloat(data?.data?.[0]?.last);
  return isNaN(p) ? null : p;
}

async function fromBinance(contract) {
  const symbol = contract.replace('_', ''); // ETH_USDT -> ETHUSDT
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
    { signal: withTimeout() }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const p = parseFloat(data?.price);
  return isNaN(p) ? null : p;
}

const SOURCES = [
  ['gateio', fromGateio],
  ['bybit', fromBybit],
  ['okx', fromOkx],
  ['binance', fromBinance],
];

// Returns { price: number|null, source: string|null, errors: {source: msg} }
export async function fetchPrice(contract) {
  const errors = {};
  for (const [name, fn] of SOURCES) {
    try {
      const p = await fn(contract);
      if (p !== null && p > 0) return { price: p, source: name, errors };
      errors[name] = 'no price in response';
    } catch (err) {
      errors[name] = err.name === 'TimeoutError' ? 'timeout' : err.message;
    }
  }
  return { price: null, source: null, errors };
}

// Fetch all unique contracts in parallel.
// Returns { prices: {contract: number|null}, sources: {contract: string|null}, diag: {contract: errors} }
export async function fetchAllPrices(contracts) {
  const unique = [...new Set(contracts)];
  const results = await Promise.all(
    unique.map(async (c) => [c, await fetchPrice(c)])
  );
  const prices = {};
  const sources = {};
  const diag = {};
  for (const [c, r] of results) {
    prices[c] = r.price;
    sources[c] = r.source;
    if (r.price === null) diag[c] = r.errors;
  }
  return { prices, sources, diag };
}
