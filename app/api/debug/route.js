const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  const result = {
    env: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: !!process.env.SUPABASE_SECRET_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      WEBHOOK_SECRET: !!process.env.WEBHOOK_SECRET,
    },
    supabase: null,
    gateio: null,
    trades_sample: null,
    errors: [],
  };

  // 1. Supabase — read open trades
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      result.supabase = 'SKIP — env vars missing';
    } else {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trades?status=eq.open&select=id,contract,direction,entry_price,current_price,pnl_usdt,stage,size,created_at&limit=5`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const data = await res.json();
      result.supabase = { status: res.status, ok: res.ok, row_count: Array.isArray(data) ? data.length : 'non-array' };
      if (Array.isArray(data) && data.length > 0) {
        result.trades_sample = data.map(t => ({
          id: t.id,
          contract: t.contract,
          direction: t.direction,
          entry_price: t.entry_price,
          current_price: t.current_price,   // null = column missing or never set
          pnl_usdt: t.pnl_usdt,
          stage: t.stage,
          size: t.size,
        }));
      } else if (!Array.isArray(data)) {
        result.supabase.body = data;  // likely an error object
        result.errors.push('Supabase returned non-array: ' + JSON.stringify(data));
      }
    }
  } catch (err) {
    result.supabase = 'ERROR';
    result.errors.push('Supabase fetch threw: ' + err.message);
  }

  // 2. Gate.io — fetch BTC_USDT price
  try {
    const res = await fetch('https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=BTC_USDT');
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    result.gateio = {
      status: res.status,
      ok: res.ok,
      raw_preview: text.slice(0, 300),
      last_price: parsed?.[0]?.last ?? null,
    };
  } catch (err) {
    result.gateio = 'ERROR';
    result.errors.push('Gate.io fetch threw: ' + err.message);
  }

  // 3. Test /api/prices proxy (self-call via relative won't work server-side, so direct Gate.io above is the real test)

  return Response.json(result, {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}
