export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_settings?id=eq.1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    cache: 'no-store',
  });
  const data = await res.json();
  // Return defaults if table doesn't exist yet
  const row = data?.[0] ?? { leverage: 50, risk_pct: 10, use_sl: false };
  return Response.json(row, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  const body = await req.json();
  const leverage = Math.min(80, Math.max(1, parseInt(body.leverage) || 50));
  const risk_pct = Math.min(50, Math.max(1, parseFloat(body.risk_pct) || 10));
  const use_sl = !!body.use_sl;

  await fetch(`${SUPABASE_URL}/rest/v1/bot_settings?id=eq.1`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ leverage, risk_pct, use_sl, updated_at: new Date().toISOString() }),
  });
  return Response.json({ ok: true, leverage, risk_pct, use_sl });
}
