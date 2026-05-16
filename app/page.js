'use client';
import { useEffect, useState } from 'react';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchTrades() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?order=created_at.desc&limit=50`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TPBar({ label, price, pct, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#5a5a7a', marginBottom: 3 }}>
        <span>{label} — ${fmt(price)}</span>
        <span style={{ color: pct > 50 ? '#00e87a' : '#5a5a7a' }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: 4, width: `${pct}%`, borderRadius: 2, background: color, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

function PositionCard({ trade }) {
  const isLong = trade.direction === 'long';
  const pnl = Number(trade.pnl_usdt || 0);
  const entry = Number(trade.entry_price);
  const tp1 = Number(trade.tp1_price);
  const tp2 = Number(trade.tp2_price);
  const tp3 = Number(trade.tp3_price);
  const sl = Number(trade.sl_price);
  const pct1 = tp1 ? Math.min(100, Math.max(0, Math.round(Math.abs((entry - entry) / (tp1 - entry)) * 100))) : 0;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 10, fontWeight: 500, padding: '3px 8px', borderRadius: 4, letterSpacing: '0.5px',
            background: isLong ? '#001a0e' : '#1a0008',
            color: isLong ? '#00e87a' : '#ff4466',
            border: `0.5px solid ${isLong ? '#00e87a44' : '#ff446644'}`,
          }}>
            {isLong ? '▲ LONG' : '▼ SHORT'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#e8e8f0' }}>{trade.contract}</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 500, fontFamily: 'monospace', color: pnl >= 0 ? '#00e87a' : '#ff4466' }}>
          {pnl >= 0 ? '+' : ''}${fmt(pnl)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          ['Entry', `$${fmt(entry)}`],
          ['Size', `${trade.size} contracts`],
          ['Stop loss', `$${fmt(sl)}`],
          ['TP1', `$${fmt(tp1)}`],
          ['TP2', `$${fmt(tp2)}`],
          ['TP3', `$${fmt(tp3)}`],
        ].map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#5a5a7a', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: label === 'Stop loss' ? '#ff4466' : '#b0b0cc', fontFamily: 'monospace' }}>{val}</div>
          </div>
        ))}
      </div>

      <TPBar label="TP1 — Median" price={tp1} pct={pct1} color="#00e87a" />
      <TPBar label="TP2 — 61.8%" price={tp2} pct={Math.round(pct1 * 0.6)} color="#3a3a5a" />
      <TPBar label="TP3 — 88.3%" price={tp3} pct={Math.round(pct1 * 0.3)} color="#2a2a4a" />

      <div style={{ fontSize: 10, color: '#5a5a7a', marginTop: 8, textAlign: 'right' }}>
        Opened {timeAgo(trade.created_at)}
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
      <td style={{ padding: '8px', color: '#b0b0cc', fontFamily: 'monospace', fontSize: 11 }}>${fmt(trade.exit_price)}</td>
      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11, color: pnl >= 0 ? '#00e87a' : '#ff4466' }}>
        {pnl >= 0 ? '+' : ''}${fmt(pnl)}
      </td>
      <td style={{ padding: '8px' }}>
        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#1e1e2e', color: '#7a7aaa' }}>
          {trade.close_reason?.toUpperCase() || '—'}
        </span>
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = async () => {
    const data = await fetchTrades();
    if (Array.isArray(data)) {
      setTrades(data);
      setLastUpdate(new Date());
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => Number(t.pnl_usdt) > 0);
  const totalPnl = closed.reduce((sum, t) => sum + Number(t.pnl_usdt || 0), 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;

  const s = {
    dash: { background: '#0a0a0f', minHeight: '100vh', padding: 20, fontFamily: "'JetBrains Mono', monospace", color: '#e8e8f0' },
    topbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '0.5px solid #1e1e2e' },
    logo: { fontSize: 20, fontWeight: 500, letterSpacing: -1, color: '#e8e8f0' },
    livePill: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#00e87a', background: '#001a0e', border: '0.5px solid #00e87a44', padding: '4px 10px', borderRadius: 20 },
    statRow: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 },
    stat: { background: '#11111e', border: '0.5px solid #1e1e2e', borderRadius: 8, padding: 14 },
    statLabel: { fontSize: 10, color: '#5a5a7a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    sectionTitle: { fontSize: 10, color: '#5a5a7a', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 10 },
    table: { width: '100%', fontSize: 11, borderCollapse: 'collapse' },
    th: { color: '#5a5a7a', textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 400, textAlign: 'left', padding: '6px 8px', borderBottom: '0.5px solid #1e1e2e' },
  };

  return (
    <div style={s.dash}>
      <div style={s.topbar}>
        <div style={s.logo}>HPDR<span style={{ color: '#00e87a' }}>bot</span></div>
        <div style={s.livePill}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e87a', display: 'inline-block' }} />
          Live · BTC/USDT Perpetual
          {lastUpdate && <span style={{ color: '#5a5a7a', marginLeft: 8 }}>· {timeAgo(lastUpdate.toISOString())}</span>}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#5a5a7a', marginTop: 60, fontSize: 13 }}>Loading trades...</div>
      ) : (
        <>
          <div style={s.statRow}>
            {[
              ['Total trades', closed.length, '#4488ff'],
              ['Win rate', `${winRate}%`, '#00e87a'],
              ['Open now', open.length, '#ffaa00'],
              ['Total P&L', `${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}`, totalPnl >= 0 ? '#00e87a' : '#ff4466'],
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
              open.map(t => <PositionCard key={t.id} trade={t} />)
            )}
          </div>

          <div>
            <div style={s.sectionTitle}>Closed trades ({closed.length})</div>
            {closed.length === 0 ? (
              <div style={{ color: '#5a5a7a', fontSize: 12, padding: '20px 0' }}>No closed trades yet</div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Pair', 'Dir', 'Entry', 'Exit', 'P&L', 'Closed by'].map(h => (
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
    </div>
  );
}
