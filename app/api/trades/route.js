export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Response.json(
      { error: 'Supabase env vars not set on server', supabase_url_set: !!SUPABASE_URL, supabase_key_set: !!SUPABASE_KEY },
      { status: 500 }
    );
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/trades?order=created_at.desc&limit=100`,
    {
      cache: 'no-store',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: `Supabase ${res.status}: ${err}` }, { status: 502 });
  }

  const data = await res.json();
  return Response.json(Array.isArray(data) ? data : [], {
    headers: { 'Cache-Control': 'no-store' },
  });
}
