export const dynamic = 'force-dynamic';

import { fetchPrice } from '../../../lib/prices.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  const result = {
    env: {
      SUPABASE_URL_set: !!SUPABASE_URL,
      SUPABASE_URL_prefix: (SUPABASE_URL || '').slice(0, 35) || '(not set)',
      SUPABASE_SECRET_KEY_set: !!SUPABASE_KEY,
      SUPABASE_SECRET_KEY_length: (SUPABASE_KEY || '').length,
      NEXT_PUBLIC_SUPABASE_URL_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      WEBHOOK_SECRET_set: !!process.env.WEBHOOK_SECRET,
    },
    supabase: null,
    trades_count: null,
    price_test: null,
    errors: [],
  };

  // 1. Test Supabase connection
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      result.supabase = 'SKIP — env vars missing';
    } else {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/trades?select=id,status,contract&limit=5`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        result.supabase = 'OK';
        result.trades_count = data.length;
        result.trades_sample = data;
      } else {
        result.supabase = `ERROR ${res.status}`;
        result.errors.push(JSON.stringify(data));
      }
    }
  } catch (err) {
    result.supabase = 'EXCEPTION';
    result.errors.push(err.message);
  }

  // 2. Test price fetching (multi-source fallback)
  try {
    const { price, source, errors } = await fetchPrice('BTC_USDT');
    result.price_test = { price, source, errors };
  } catch (err) {
    result.price_test = 'EXCEPTION';
    result.errors.push('price fetch: ' + err.message);
  }

  return Response.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
