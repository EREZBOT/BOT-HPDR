export const dynamic = 'force-dynamic';

import { fetchAllPrices } from '../../../lib/prices.js';

export async function GET(req) {
  try {
    const contracts = new URL(req.url).searchParams.get('contracts') || '';
    const list = contracts.split(',').map(s => s.trim()).filter(Boolean);

    if (list.length === 0) {
      return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
    }

    const { prices, sources, diag } = await fetchAllPrices(list);

    // Flat shape { CONTRACT: price } plus debug fields, for the dashboard poll
    return Response.json(
      { ...prices, _sources: sources, _diag: diag },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[prices] Fatal:', err.message);
    return Response.json({ _error: err.message }, { status: 500 });
  }
}
