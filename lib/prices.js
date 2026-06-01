// Multi-exchange price fetcher for USDT perpetuals.
// Tries 5 sources in order. Gate.io/Binance often block datacenter IPs
// (Vercel returns 451/403). Bybit, OKX, and CryptoCompare are cloud-safe.
//
// `contract` is the Gate.io style symbol, e.g. "ETH_USDT".

const TIMEOUT = 5000;

function sig() {
  try { return AbortSignal.timeout(TIMEOUT); } catch { return undefined; }
}

async function fromGateio(contract) {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`,
    { signal: sig() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const p = parseFloat(data?.[0]?.last);
  if (isNaN(p) || p <= 0) throw new Error('no price in response');
  return p;
}

async function fromBybit(contract) {
  const symbol = contract.replace('_', ''); // ETH_USDT -> ETHUSDT
  const res = await fetch(
    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    { signal: sig() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const p = parseFloat(data?.result?.list?.[0]?.lastPrice);
  if (isNaN(p) || p <= 0) throw new Error('no price in response');
  return p;
}

async function fromOkx(contract) {
  const instId = contract.replace('_', '-') + '-SWAP'; // ETH_USDT -> ETH-USDT-SWAP
  const res = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${instId}`,
    { signal: sig() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const p = parseFloat(data?.data?.[0]?.last);
  if (isNaN(p) || p <= 0) throw new Error('no price in response');
  return p;
}

async function fromBinance(contract) {
  const symbol = contract.replace('_', ''); // ETH_USDT -> ETHUSDT
  const res = await fetch(
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
    { signal: sig() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const p = parseFloat(data?.price);
  if (isNaN(p) || p <= 0) throw new Error('no price in response');
  return p;
}

// CryptoCompare: fully public, no API key, no geo/IP restrictions.
// ETH_USDT -> base=ETH, quote=USDT
async function fromCryptoCompare(contract) {
  const [base, quote] = contract.split('_');
  if (!base || !quote) throw new Error('cannot parse contract');
  const res = await fetch(
    `https://min-api.cryptocompare.com/data/price?fsym=${base}&tsyms=${quote}`,
    { signal: sig() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.Response === 'Error') throw new Error(data.Message || 'api error');
  const p = parseFloat(data?.[quote]);
  if (isNaN(p) || p <= 0) throw new Error('no price in response');
  return p;
}

const SOURCES = [
  ['gateio',       fromGateio],
  ['bybit',        fromBybit],
  ['okx',          fromOkx],
  ['binance',      fromBinance],
  ['cryptocompare', fromCryptoCompare],
];

// Returns { price: number|null, source: string|null, errors: {source: msg} }
export async function fetchPrice(contract) {
  const errors = {};
  for (const [name, fn] of SOURCES) {
    try {
      const p = await fn(contract);
      return { price: p, source: name, errors };
    } catch (err) {
      errors[name] = err.name === 'TimeoutError' ? 'timeout' : err.message;
    }
  }
  return { price: null, source: null, errors };
}

// Fetch all unique contracts in parallel.
// Returns { prices, sources, diag }
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
