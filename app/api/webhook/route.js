export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const EQUITY = 1000;
const RISK_PCT = 0.10;
const LEVERAGE = 25;

function toGateContract(symbol) {
  const s = symbol.toUpperCase().replace(/\.P$/, '').replace(/PERP$/, '');
  if (s.endsWith('_USDT')) return s;
  if (s.endsWith('USDT')) return s.slice(0, -4) + '_USDT';
  return s;
}

async function getPrice(contract) {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`
  );
  const data = await res.json();
  return parseFloat(data[0]?.last || 0);
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
  return Array.isArray(data) && data.length > 0;
}

export async function POST(req) {
  try {
    if (WEBHOOK_SECRET) {
      const fromHeader = req.headers.get('x-webhook-secret');
      const fromQuery = new URL(req.url).searchParams.get('secret');
      if (fromHeader !== WEBHOOK_SECRET && fromQuery !== WEBHOOK_SECRET) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();
    const { action, symbol, sl_pct, price, tp1_price, tp2_price } = body;

    if (!action || !symbol) {
      return Response.json({ error: 'Missing action or symbol' }, { status: 400 });
    }
    if (!['long', 'short'].includes(action)) {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    const contract = toGateContract(symbol);

    const alreadyOpen = await hasOpenTrade(contract);
    if (alreadyOpen) {
      return Response.json({ error: `Trade already open for ${contract}` }, { status: 409 });
    }

    const currentPrice = price ? parseFloat(price) : await getPrice(contract);
    if (!currentPrice) {
      return Response.json({ error: 'Could not determine entry price' }, { status: 500 });
    }

    const isLong = action === 'long';
    const slPct = parseFloat(sl_pct) || 2.5;

    const riskAmount = EQUITY * RISK_PCT;
    const positionValue = (riskAmount / (slPct / 100)) * LEVERAGE;
    const size = Math.max(1, Math.floor(positionValue / currentPrice));

    const slPrice = isLong
      ? currentPrice * (1 - slPct / 100)
      : currentPrice * (1 + slPct / 100);

    const tp1 = tp1_price
      ? parseFloat(tp1_price)
      : isLong
        ? currentPrice * (1 + slPct / 100)
        : currentPrice * (1 - slPct / 100);

    const tp2 = tp2_price
      ? parseFloat(tp2_price)
      : isLong
        ? currentPrice * (1 + (slPct / 100) * 2)
        : currentPrice * (1 - (slPct / 100) * 2);

    const trade = {
      contract,
      direction: action,
      entry_price: currentPrice,
      size,
      sl_price: slPrice,
      tp1_price: tp1,
      tp2_price: tp2,
      current_price: currentPrice,
      status: 'open',
      stage: 0,
      pnl_usdt: 0,
      pnl_pct: 0,
    };

    const saved = await saveTrade(trade);
    console.log(`[HPDR] New trade: ${action.toUpperCase()} ${contract} @ ${currentPrice}`);
    return Response.json({ success: true, trade: saved });

  } catch (err) {
    console.error('[HPDR] Webhook error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: 'HPDR Bot online', mode: 'paper', version: '2.0' });
}
