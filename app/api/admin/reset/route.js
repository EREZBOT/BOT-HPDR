export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function POST(req) {
  try {
    // Require the webhook secret as authorization
    const fromHeader = req.headers.get('x-webhook-secret');
    const fromQuery = new URL(req.url).searchParams.get('secret');
    if (!WEBHOOK_SECRET || (fromHeader !== WEBHOOK_SECRET && fromQuery !== WEBHOOK_SECRET)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return Response.json({ error: 'Supabase env vars not set' }, { status: 500 });
    }

    // Count first so we can report how many were deleted
    const countRes = await fetch(`${SUPABASE_URL}/rest/v1/trades?select=id`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' },
    });
    const countHeader = countRes.headers.get('content-range') || '';
    const total = countHeader.split('/')[1] || '?';

    // Delete all trades
    const delRes = await fetch(`${SUPABASE_URL}/rest/v1/trades?id=gte.0`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });

    if (!delRes.ok) {
      const err = await delRes.text();
      return Response.json({ error: `Delete failed: ${err}` }, { status: 500 });
    }

    console.log(`[HPDR] Reset: deleted ${total} trades`);
    return Response.json({ success: true, deleted: total });
  } catch (err) {
    console.error('[HPDR] Reset error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
