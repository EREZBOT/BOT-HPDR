export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const headers = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });

export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions?order=created_at.desc`, {
    headers: headers(), cache: 'no-store',
  });
  const data = await res.json();
  return Response.json(Array.isArray(data) ? data : [], { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req) {
  const fromHeader = req.headers.get('x-webhook-secret');
  const fromQuery = new URL(req.url).searchParams.get('secret');
  if (WEBHOOK_SECRET && fromHeader !== WEBHOOK_SECRET && fromQuery !== WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const label = body.label || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Compute stats from all current closed trades
  const closedRes = await fetch(`${SUPABASE_URL}/rest/v1/trades?status=eq.closed&select=pnl_usdt`, {
    headers: headers(), cache: 'no-store',
  });
  const closedTrades = await closedRes.json();
  const allRes = await fetch(`${SUPABASE_URL}/rest/v1/trades?select=id`, {
    headers: headers(), cache: 'no-store',
  });
  const allTrades = await allRes.json();

  const closed = Array.isArray(closedTrades) ? closedTrades : [];
  const wins = closed.filter(t => Number(t.pnl_usdt) > 0);
  const losses = closed.filter(t => Number(t.pnl_usdt) < 0);
  const total_pnl = closed.reduce((s, t) => s + Number(t.pnl_usdt || 0), 0);
  const win_rate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const total_trades = Array.isArray(allTrades) ? allTrades.length : 0;

  // Save session summary
  await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers(), Prefer: 'return=minimal' },
    body: JSON.stringify({ label, total_trades, wins: wins.length, losses: losses.length, win_rate, total_pnl }),
  });

  // Delete all trades
  await fetch(`${SUPABASE_URL}/rest/v1/trades?id=gte.0`, {
    method: 'DELETE',
    headers: headers(),
  });

  return Response.json({ ok: true, archived: { total_trades, wins: wins.length, losses: losses.length, win_rate, total_pnl } });
}
