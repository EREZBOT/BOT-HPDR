// HPDR Bot v3 - Gate.io Integration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const GATE_API_KEY = process.env.GATE_API_KEY;
const GATE_SECRET = process.env.GATE_SECRET;

import crypto from 'crypto';

function gateSignature(method, path, queryString, body, timestamp) {
  const hashedBody = crypto.createHash('sha512').update(body || '').digest('hex');
  const msg = `${method}\n${path}\n${queryString}\n${hashedBody}\n${timestamp}`;
  return crypto.createHmac('sha512', GATE_SECRET).update(msg).digest('hex');
}

async function openGateTrade(symbol, isLong, size = 1) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = '/api/v4/futures/usdt/orders';
  const body = JSON.stringify({
    contract: symbol,
    size: isLong ? size : -size,
    price: '0',
    tif: 'ioc',
    text: 'hpdr-bot',
  });
  const sign = gateSignature('POST', path, '', body, timestamp);
  const res = await fetch(`https://api.gateio.ws${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'KEY': GATE_API_KEY,
      'SIGN': sign,
      'Timestamp': timestamp,
    },
    body,
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

    const tp1Price = tp1 ? parseFloat(tp1) : isLong ? currentPrice * 1.015 : currentPrice * 0.985;
    const tp2Price = tp2 ? parseFloat(tp2) : isLong ? currentPrice * 1.025 : currentPrice * 0.975;
    const tp3Price = tp3 ? parseFloat(tp3) : isLong ? currentPrice * 1.04 : currentPrice * 0.96;

    const gateResult = await openGateTrade(symbol, isLong, 1);
    console.log('Gate.io result:', JSON.stringify(gateResult));

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
    return Response.json({ success: true, trade: saved, gate: gateResult });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
