export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      {
        error: 'Supabase env vars not set on server',
        supabase_url_set: !!supabaseUrl,
        supabase_key_set: !!supabaseKey,
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/trades?order=created_at.desc&limit=50`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        {
          error: `Supabase responded ${res.status}: ${text}`,
          supabase_url_set: true,
          supabase_key_set: true,
        },
        { status: 500 }
      );
    }

    const data = await res.json();
    return Response.json(Array.isArray(data) ? data : [], {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[/api/trades] fetch error:', err.message);
    return Response.json(
      {
        error: err.message,
        supabase_url_set: !!supabaseUrl,
        supabase_key_set: !!supabaseKey,
      },
      { status: 500 }
    );
  }
}
