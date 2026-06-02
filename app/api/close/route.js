const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

// FIX 5a: CLOSE_SECRET is a dedicated secret for the manual-close endpoint.
// It is intentionally separate from WEBHOOK_SECRET so it can be exposed as
// NEXT_PUBLIC_CLOSE_SECRET in the dashboard without leaking the inbound webhook
// secret. Set both to the same value in Vercel if you want simplicity, or use
// different values for better isolation.
const CLOSE_SECRET = process.env.CLOSE_SECRET;

const EQUITY_START = 1000;

async function getPrice(contract) {
  const res = await fetch(
    `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${contract}`
  );
  const data = await res.json();
  return parseFloat(data[0]?.last || 0);
}

export async function POST(req) {
  try {
    // ── FIX 5a: authentication ────────────────────────────────────────────────
    // Without this check, any HTTP client that guesses or enumerates a trade ID
    // (sequential integers) can close any position at any time.
    // The dashboard sends this header using the NEXT_PUBLIC_CLOSE_SECRET env var.
    if (CLOSE_SECRET) {
      const provided = req.headers.get('x-close-secret');
      if (provided !== CLOSE_SECRET) {
        console.warn('[HPDR] Close: unauthorized attempt rejected');
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json();

    // ── FIX 5b: id validation — prevent URL parameter injection ──────────────
    // BEFORE: `const { id } = await req.json()` then `?id=eq.${id}` directly.
    //   A payload like {"id": "1&status=eq.open"} manipulates the Supabase query.
    //
    // AFTER: parseInt with strict bounds check. Any non-positive-integer id is
    //   rejected before it can touch the URL.
    const safeId = parseInt(body.id, 10);
    if (!Number.isInteger(safeId) || safeId <= 0) {
      return Response.json({ error: 'Invalid id — must be a positive integer' }, { status: 400 });
    }

    // Fetch the trade using the validated integer id
    const tradeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/trades?id=eq.${safeId}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await tradeRes.json();
    const trade = rows[0];
    if (!trade) return Response.json({ error: 'Trade not found' }, { status: 404 });
    if (trade.status !== 'open') return Response.json({ error: 'Trade already closed' }, { status: 400 });

    const price = await getPrice(trade.contract);
    if (!price) return Response.json({ error: 'Could not fetch price' }, { status: 500 });

    const entry = parseFloat(trade.entry_price);
    const isLong = trade.direction === 'long';
    const pnlUsdt = isLong
      ? (price - entry) * trade.size
      : (entry - price) * trade.size;
    const pnlPct = (pnlUsdt / EQUITY_START) * 100;

    // Use safeId (not body.id) in the PATCH URL
    await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${safeId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        status: 'closed',
        exit_price: price,
        close_reason: 'manual',
        pnl_usdt: pnlUsdt,
        pnl_pct: pnlPct,
        current_price: price,
        closed_at: new Date().toISOString(),
      }),
    });

    console.log(`[HPDR] Manual close: ${trade.contract} @ ${price}, PnL: ${pnlUsdt.toFixed(2)}`);
    return Response.json({ success: true, exit_price: price, pnl_usdt: pnlUsdt });
  } catch (err) {
    console.error('[HPDR] Close error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
