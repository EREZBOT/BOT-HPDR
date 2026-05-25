// HPDR Bot v4 - Gate.io Integration Fixed
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const GATE_API_KEY = process.env.GATE_API_KEY;
const GATE_SECRET = process.env.GATE_SECRET;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

import crypto from 'crypto';

const EQUITY = 1000; // Paper mode equity fixed at $1000
const RISK_PCT = 0.05; // 5% risk per trade
const SL_PCT = 0.03; // 3% stop loss

function gateSignature(method, path, queryString, body, timestamp) {
  const hashedBody = crypto.createHash('sha512').update(body || '').digest('hex');
  const msg = `${method}\n${path}\n${queryString}\n${hashedBody}\n${timestamp}`;
  return crypto.createHmac('sha512', GATE_SECRET).update(msg).digest('hex');
}

async function getPrice(contract) {
  const res = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`);
  const data = await res.json();
  return parseFloat(data[0]?.last || 0);
}

async function getBalance() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = '/api/v4/futures/usdt/accounts';
  const sign = gateSignature('GET', path, '', '', timestamp);
  const res = await fetch(`https://api.gateio.ws${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'KEY': GATE_API_KEY,
      'SIGN': sign,
      'Timestamp': timestamp,
    }
  });
  const data = await res.json();
  return parseFloat(data?.available || EQUITY);
}

async function openGateTrade(contract, isLong, size) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = '/api/v4/futures/usdt/orders';
  const body = JSON.stringify({
    contract,
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

async function hasOpenTrade(contract) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/trades?contract=eq.${contract}&status=eq.open&select=id`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const data = await res.json();
  return data.length > 0;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { action, symbol, sl_pct, price } = body;

    if (!action || !symbol) {
      return Response.json({ error: 'Missing action or symbol' }, { status: 400 });
    }

    // Convert TradingView symbol to Gate.io format
    const contract = symbol
      .replace('USDT.P', '_USDT')
      .replace('USDT', '_USDT')
      .replace('.P', '')
      .replace('PERP', '')
      .toUpperCase();

    // Prevent duplicate trades
    const alreadyOpen = await hasOpenTrade(contract);
    if (alreadyOpen) {
      return Response.json({ error: `Trade already open for ${contract}` }, { status: 409 });
    }

    const currentPrice = price ? parseFloat(price) : await getPrice(contract);
    const isLong = action === 'long';
    const slPct = sl_pct || SL_PCT * 100;

    // Calculate position size based on risk
    const riskAmount = EQUITY * RISK_PCT;
    const slDistance = currentPrice * (slPct / 100);
    const positionValue = riskAmount / (slPct / 100) * 30; // x30 leverage
    const size = Math.max(1, Math.floor(positionValue / currentPrice));

    const slPrice = isLong
      ? currentPrice * (1 - slPct / 100)
      : currentPrice * (1 + slPct / 100);

    const gateResult = await openGateTrade(contract, isLong, size);
    console.log('Gate.io result:', JSON.stringify(gateResult));

    const trade = {
      contract,
      direction: action,
      entry_price: currentPrice,
      size,
      sl_price: slPrice,
      current_price: currentPrice,
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
