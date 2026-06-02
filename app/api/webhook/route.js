
console.log("ENV CHECK");
console.log(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const EQUITY = 1000;
const RISK_PCT = 0.10;
// LEVERAGE removed from this file — it was incorrectly used in position sizing.
// Leverage is a margin concept (how much collateral the exchange requires) and
// does NOT amplify the USDT P&L per contract in a paper system. See sizing below.

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
      // return=representation: get the saved row back so the caller can return it.
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(trade),
  });

  // Supabase returns 409 when the unique partial index blocks a duplicate open trade.
  // This is the definitive atomic guard — surface it so the caller returns a clean 409.
  if (res.status === 409) {
    return { _duplicate: true };
  }

  const data = await res.json();

  // Any other non-2xx is an unexpected DB error — log it so it is not silently swallowed.
  if (!res.ok) {
    console.error('[HPDR] Supabase insert error:', JSON.stringify(data));
    return { _error: true, detail: data };
  }

  return data;
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

    // hasOpenTrade() is a fast pre-check that avoids a wasted insert attempt in the
    // common case. It is NOT the race-condition guard — the unique partial index in
    // the DB is. Two simultaneous calls can both pass here; the DB rejects the second.
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

    // ── FIXED: position sizing ──────────────────────────────────────────────────
    // BEFORE (incorrect):
    //   positionValue = (riskAmount / slPct%) * LEVERAGE   ← leverage inflates size 25×
    //   size = floor(positionValue / price)
    //   Example: ETH @ $3,000 → 33 contracts ($2,475 risk vs $100 budget)
    //
    // AFTER (correct):
    //   riskPerContract = entry_price × sl_pct%  ← USDT lost on this contract if SL hits
    //   size = floor(riskAmount / riskPerContract)
    //   Example: ETH @ $3,000 → floor(100 / 75) = 1 contract ($75 risk ≈ $100 budget)
    //
    // Leverage is NOT in this formula. It determines margin requirements at the exchange,
    // not how much USDT you gain or lose per price unit on one contract.
    const riskAmount = EQUITY * RISK_PCT;                     // e.g. $100
    const riskPerContract = currentPrice * (slPct / 100);     // USDT at risk per contract
    const size = Math.max(1, Math.floor(riskAmount / riskPerContract));

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

    // DB unique index fired — a concurrent request beat us to the insert.
    if (saved._duplicate) {
      return Response.json({ error: `Trade already open for ${contract}` }, { status: 409 });
    }
    // Unexpected DB error.
    if (saved._error) {
      return Response.json({ error: 'Failed to save trade to database' }, { status: 500 });
    }

    console.log(`[HPDR] New trade: ${action.toUpperCase()} ${contract} @ ${currentPrice}, size: ${size}`);
    return Response.json({ success: true, trade: saved });

  } catch (err) {
    console.error('[HPDR] Webhook error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: 'HPDR Bot online', mode: 'paper', version: '2.0' });
}
