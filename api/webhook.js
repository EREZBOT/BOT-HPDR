import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const GATE_API_URL = 'https://fx.gate.io';
const GATE_API_KEY = process.env.GATE_API_KEY;
const GATE_SECRET = process.env.GATE_SECRET;

function gateSign(method, url, queryString, body, timestamp) {
  const bodyHash = crypto.createHash('sha512').update(body || '').digest('hex');
  const msg = `${method}\n${url}\n${queryString || ''}\n${bodyHash}\n${timestamp}`;
  return crypto.createHmac('sha512', GATE_SECRET).update(msg).digest('hex');
}

async function gateRequest(method, path, params = {}, body = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const queryString = method === 'GET' ? new URLSearchParams(params).toString() : '';
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = gateSign(method, path, queryString, bodyStr, timestamp);
  const url = `${GATE_API_URL}${path}${queryString ? '?' + queryString : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'KEY': GATE_API_KEY,
      'Timestamp': timestamp,
      'SIGN': sign,
    },
    body: bodyStr || undefined,
  });
  return res.json();
}

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
    const { action, symbol, sl_pct = 2.5 } = body;

    if (!action || !symbol) {
      return Response.json({ error: 'Missing action or symbol' }, { status: 400 });
    }

    const ticker = await gateRequest('GET', '/api/v4/futures/usdt/contracts/' + symbol);
    const currentPrice = parseFloat(ticker.last_price || ticker.mark_price || 0);

    if (!currentPrice) {
      return Response.json({ error: 'Could not get price' }, { status: 500 });
    }

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
