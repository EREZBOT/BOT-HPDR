export const dynamic = 'force-dynamic';

import { fetchAllPrices } from '../../../lib/prices.js';

// REST fallback for the dashboard. The browser's primary price feed is the
// Gate.io WebSocket (which connects from the user's own IP and is NOT blocked).
// This endpoint runs on Vercel, where Gate.io returns 451, so it relies on the
// Bybit/OKX/CryptoCompare fallbacks inside fetchAllPrices.
export async function GET(req) {
  try {
    const contracts = new URL(req.url).searchParams.get('contracts') || '';
    const list = contracts.split(',').map(s => s.trim()).filter(Boolean);

    if (list.length === 0) {
      return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { prices } = await fetchAllPrices(list);

    // Flat shape { CONTRACT: price|null } for the dashboard price poll.
    return Response.json(prices, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[prices] Fatal:', err.message);
    return Response.json({ _error: err.message }, { status: 500 });
  }
}
