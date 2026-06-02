export const dynamic = 'force-dynamic';

// Diagnostics only — reports whether env vars are present WITHOUT echoing their
// values. Returning the raw Supabase URL/keys from a public endpoint would leak
// them to anyone who hits /api/test.
export async function GET() {
  return Response.json({
    SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ? 'SET' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
    WEBHOOK_SECRET: process.env.WEBHOOK_SECRET ? 'SET' : 'MISSING',
    CRON_SECRET: process.env.CRON_SECRET ? 'SET' : 'MISSING',
    CLOSE_SECRET: process.env.CLOSE_SECRET ? 'SET' : 'MISSING',
  });
}
