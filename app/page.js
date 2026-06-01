'use client';
import { useEffect, useState, useRef } from 'react';

async function fetchTrades() {
  try {
    const res = await fetch('/api/trades');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// Server-side proxy — no CORS issues
async function fetchPrices(contracts) {
  if (!contracts.length) return {};
  try {
    const res = await fetch(`/api/prices?contracts=${contracts.join(',')}`);
    return await res.json();
  } catch {
    return {};
  }
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function TPBar({ label, price, pct, color }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5a5a7a', marginBottom: 3 }}>
        <span>{label} — ${fmt(price)}</span>
        <span style={{ color: clamped > 50 ? '#00e87a' : '#5a5a7a' }}>{clamped}%</span>
      </div>
      <div style={{ height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: 4, width: `${clamped}%`, borderRadius: 2, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function PositionCard({ trade, livePrice }) {
  const isLong = trade.direction === 'long';
  const entry = Number(trade.entry_price);
  const tp1 = Number(trade.tp1_price) || 0;
  const tp2 = Number(trade.tp2_price) || 0;
  const sl = Number(trade.sl_price);
  const size = Number(trade.size);
  const stage = trade.stage ?? 0;

  // Prefer live price, then DB current_price, then entry
  const current = livePrice || Number(trade.current_price) || entry;

  const pnlUsdt = isLong ? (current - entry) * size : (entry - current) * size;
  const pnlPct = (pnlUsdt / 1000) * 100;

  const progress = isLong ? current - entry : entry - current;
  const range1 = tp1 - entry || 1;
  const range2 = tp2 - entry || 1;
  const pct1 = tp1 ? Math.round((progress / range1) * 100) : 0;
  const pct2 = tp2 ? Math.round((progress / range2) * 100) : 0;

  return (
    <div style={{
      background: '#11111e',
      border: '0.5px solid #1e1e2e',
      borderLeft: `2px solid ${isLong ? '#00e87a' : '#ff4466'}`,
      borderRadius: 8,
      padding: 14,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
            background: isLong ? '#001a0e' : '#1a0008',
            color: isLong ? '#00e87a' : '#ff4466',
            border: `0.5px solid ${isLong ? '#00e87a44' : '#ff446644'}`,
          }}>
            {isLong ? '▲ LONG' : '▼ SHORT'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#e8e8f0' }}>{trade.contract}</span>
          {stage >= 1 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#1a1a0e', color: '#ffaa00', border: '0.5px solid #ffaa0044' }}>
              BE
            </span>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 500, fontFamily: 'monospace', color: pnlUsdt >= 0 ? '#00e87a' : '#ff4466' }}>
            {pnlUsdt >= 0 ? '+' : ''}${fmt(pnlUsdt)}
          </div>
          <div style={{ fontSize: 11, color: pnlPct >= 0 ? '#00e87a' : '#ff4466' }}>
            {pnlPct >= 0 ? '+' : ''}{fmt(pnlPct)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          ['Entry', `$${fmt(entry)}`],
          ['Current', `$${fmt(current)}`],
          ['Size', `${size} cts`],
          ['Stop loss', `$${fmt(sl)}`],
          ['TP1', tp1 ? `$${fmt(tp1)}` : '—'],
          ['TP2', tp2 ? `$${fmt(tp2)}` : '—'],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#5a5a7a', marginBottom: 2 }}>{label}</div>
            <div style={{
              fontSize: 11, fontFamily: 'monospace',
              color: label === 'Stop loss' ? '#ff4466'
                : label === 'Current' ? (pnlUsdt >= 0 ? '#00e87a' : '#ff4466')
                : '#b0b0cc',
            }}>{val}</div>
          </div>
        ))}
      </div>

      <TPBar label="TP1" price={tp1} pct={pct1} color="#00e87a" />
      <TPBar label="TP2" price={tp2} pct={pct2} color="#3a3a5a" />

      <div style={{ fontSize: 10, color: '#5a5a7a', marginTop: 8, textAlign: 'right' }}>
        Opened {timeAgo(trade.created_at)}
        {livePrice ? <span style={{ color: '#2a6a4a', marginLeft: 8 }}>● live</span> : null}
      </div>
    </div>
  );
}

function HistoryRow({ trade }) {
  const pnl = Number(trade.pnl_usdt || 0);
  const isLong = trade.direction === 'long';
  return (
    <tr style={{ borderBottom: '0.5px solid #111120' }}>
      <td style={{ padding: '8px', color: '#b0b0cc', fontFamily: 'monospace', fontSize: 11 }}>{trade.contract}</td>
      <td style={{ padding: '8px', fontSize: 11, color: isLong ? '#00e87a' : '#ff4466', fontFamily: 'monospace' }}>
        {isLong ? '▲ Long' : '▼ Short'}
      </td>
      <td style={{ padding: '8px', color: '#b0b0cc', fontFamily: 'monospace', fontSize: 11 }}>${fmt(trade.entry_price)}</td>
      <td style={{ padding: '8px', color: '#b0b0cc', fontFamily: 'monospace', fontSize: 11 }}>
        {trade.exit_price ? `$${fmt(trade.exit_price)}` : '—'}
      </td>
      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11, color: pnl >= 0 ? '#00e87a' : '#ff4466' }}>
        {pnl >= 0 ? '+' : ''}${fmt(pnl)}
      </td>
      <td style={{ padding: '8px' }}>
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#1e1e2e', color: '#7a7aaa' }}>
          {trade.close_reason?.toUpperCase() || '—'}
        </span>
      </td>
      <td style={{ padding: '8px', fontSize: 10, color: '#5a5a7a' }}>
        {trade.closed_at ? timeAgo(trade.closed_at) : '—'}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastTick, setLastTick] = useState(null);
  const tradesRef = useRef([]);

  useEffect(() => {
    async function loadTrades() {
      const data = await fetchTrades();
      tradesRef.current = data;
      setTrades(data);
      setLoading(false);
    }

    loadTrades();
    const tradePoll = setInterval(loadTrades, 15000);

    const pricePoll = setInterval(async () => {
      const contracts = [...new Set(
        tradesRef.current.filter(t => t.status === 'open').map(t => t.contract)
      )];
      if (!contracts.length) return;
      const priceData = await fetchPrices(contracts);
      const updates = {};
      for (const [k, v] of Object.entries(priceData)) {
        if (typeof v === 'number' && v > 0) updates[k] = v;
      }
      if (Object.keys(updates).length) {
        setPrices(prev => ({ ...prev, ...updates }));
        setLastTick(new Date());
      }
    }, 2000);

    return () => {
      clearInterval(tradePoll);
      clearInterval(pricePoll);
    };
  }, []);

  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => Number(t.pnl_usdt) > 0);
  const losses = closed.filter(t => Number(t.pnl_usdt) < 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;

  const openPnl = open.reduce((sum, trade) => {
    const entry = Number(trade.entry_price);
    const current = prices[trade.contract] || Number(trade.current_price) || entry;
    const isLong = trade.direction === 'long';
    return sum + (isLong ? (current - entry) : (entry - current)) * Number(trade.size);
  }, 0);

  const closedPnl = closed.reduce((sum, t) => sum + Number(t.pnl_usdt || 0), 0);

  const s = {
    dash: { background: '#0a0a0f', minHeight: '100vh', padding: 20, fontFamily: "'JetBrains Mono', monospace", color: '#e8e8f0' },
    topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '0.5px solid #1e1e2e' },
    statRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 },
    stat: { background: '#11111e', border: '0.5px solid #1e1e2e', borderRadius: 8, padding: 14 },
    statLabel: { fontSize: 10, color: '#5a5a7a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    sectionTitle: { fontSize: 10, color: '#5a5a7a', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 },
    table: { width: '100%', fontSize: 11, borderCollapse: 'collapse' },
    th: { color: '#5a5a7a', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 400, textAlign: 'left', padding: '6px 8px', borderBottom: '0.5px solid #1e1e2e' },
  };

  return (
    <div style={s.dash}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={s.topbar}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: -1 }}>
            HPDR<span style={{ color: '#00e87a' }}>bot</span>
          </div>
          <div style={{ fontSize: 10, color: '#5a5a7a', marginTop: 2 }}>
            Paper Mode · x25 · Gate.io Perpetuals
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: lastTick ? '#00e87a' : '#ffaa00', background: lastTick ? '#001a0e' : '#1a1000', border: `0.5px solid ${lastTick ? '#00e87a44' : '#ffaa0044'}`, padding: '4px 10px', borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: lastTick ? '#00e87a' : '#ffaa00', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            {lastTick ? `Prices updated ${timeAgo(lastTick.toISOString())}` : 'Waiting for prices…'}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#5a5a7a', marginTop: 60, fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          <div style={s.statRow}>
            {[
              ['Closed trades', closed.length, '#4488ff'],
              ['Win rate', closed.length > 0 ? `${winRate}%` : '—', winRate >= 50 ? '#00e87a' : '#ff4466'],
              ['Open now', open.length, '#ffaa00'],
              ['Open P&L', `${openPnl >= 0 ? '+' : ''}$${fmt(openPnl)}`, openPnl >= 0 ? '#00e87a' : '#ff4466'],
            ].map(([label, val, color]) => (
              <div key={label} style={s.stat}>
                <div style={s.statLabel}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={s.sectionTitle}>Open positions ({open.length})</div>
            {open.length === 0 ? (
              <div style={{ color: '#5a5a7a', fontSize: 12, padding: '20px 0' }}>No open positions</div>
            ) : (
              open.map(t => <PositionCard key={t.id} trade={t} livePrice={prices[t.contract]} />)
            )}
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={s.sectionTitle}>
                Closed trades ({closed.length})
                {closed.length > 0 && <span style={{ marginLeft: 12, color: '#5a5a7a' }}>{wins.length}W / {losses.length}L</span>}
              </div>
              {closed.length > 0 && (
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: closedPnl >= 0 ? '#00e87a' : '#ff4466' }}>
                  Total: {closedPnl >= 0 ? '+' : ''}${fmt(closedPnl)}
                </div>
              )}
            </div>
            {closed.length === 0 ? (
              <div style={{ color: '#5a5a7a', fontSize: 12, padding: '20px 0' }}>No closed trades yet</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Pair', 'Dir', 'Entry', 'Exit', 'P&L', 'Reason', 'Closed'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {closed.map(t => <HistoryRow key={t.id} trade={t} />)}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
