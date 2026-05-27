'use client';
import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GATE_WS_URL = 'wss://fx-ws.gateio.ws/v4/ws/usdt';

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

async function fetchTrades() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?order=created_at.desc&limit=50`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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
        <div style={{ height: 4, width: `${clamped}%`, borderRadius: 2, background: color, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

async function manualClose(id) {
  const res = await fetch('/api/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return res.json();
}

function PositionCard({ trade, livePrice, onClose }) {
  const isLong = trade.direction === 'long';
  const entry = Number(trade.entry_price);
  const tp1 = Number(trade.tp1_price) || 0;
  const tp2 = Number(trade.tp2_price) || 0;
  const sl = Number(trade.sl_price);
  const size = Number(trade.size);
  const stage = trade.stage ?? 0;

  const [closing, setClosing] = useState(false);
  const dbPrice = Number(trade.current_price);
  const current = (livePrice > 0) ? livePrice : (dbPrice > 0 ? dbPrice : entry);
  const isLive = livePrice > 0;

  const handleClose = async () => {
    if (!confirm(`Close ${trade.contract} ${trade.direction.toUpperCase()} at $${fmt(current)}?`)) return;
    setClosing(true);
    const res = await manualClose(trade.id);
    if (res.error) { alert(`Error: ${res.error}`); setClosing(false); }
    else onClose();
  };

  const pnlUsdt = isLong ? (current - entry) * size : (entry - current) * size;
  const pnlPct = (pnlUsdt / 1000) * 100;

  const progress = isLong ? current - entry : entry - current;
  const pct1 = tp1 ? Math.round((progress / ((tp1 - entry) || 1)) * 100) : 0;
  const pct2 = tp2 ? Math.round((progress / ((tp2 - entry) || 1)) * 100) : 0;

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
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: '#1a1a0e', color: '#ffaa00', border: '0.5px solid #ffaa0044' }}>BE</span>
          )}
          {isLive && (
            <span style={{ fontSize: 9, color: '#00e87a', opacity: 0.7 }}>● ws</span>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <div style={{ fontSize: 10, color: '#5a5a7a' }}>Opened {timeAgo(trade.created_at)}</div>
        <button
          onClick={handleClose}
          disabled={closing}
          style={{
            fontSize: 10, padding: '4px 12px', borderRadius: 4, cursor: closing ? 'not-allowed' : 'pointer',
            background: 'transparent', border: '0.5px solid #ff446688',
            color: closing ? '#5a5a7a' : '#ff4466', opacity: closing ? 0.5 : 1,
          }}
        >
          {closing ? 'Closing…' : 'Close position'}
        </button>
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
  const [wsStatus, setWsStatus] = useState('disconnected'); // 'connected' | 'disconnected' | 'error'

  const wsRef = useRef(null);
  const pingRef = useRef(null);
  const reconnectRef = useRef(null);
  const subscribedRef = useRef([]);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connectWs = useCallback((contracts) => {
    if (!contracts.length) return;

    // Close previous connection cleanly
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect loop on intentional close
      wsRef.current.close();
    }
    clearInterval(pingRef.current);
    clearTimeout(reconnectRef.current);

    subscribedRef.current = contracts;
    const ws = new WebSocket(GATE_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      ws.send(JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: 'futures.tickers',
        event: 'subscribe',
        payload: contracts,
      }));
      // Keep-alive ping every 10 s
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), channel: 'futures.ping' }));
        }
      }, 10000);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.channel === 'futures.tickers' && msg.event === 'update') {
          const tickers = Array.isArray(msg.result) ? msg.result : [msg.result];
          setPrices(prev => {
            const next = { ...prev };
            for (const t of tickers) {
              const p = parseFloat(t.last);
              if (t.contract && !isNaN(p) && p > 0) next[t.contract] = p;
            }
            return next;
          });
          setLastTick(new Date());
        }
      } catch {}
    };

    ws.onerror = () => setWsStatus('error');

    ws.onclose = () => {
      setWsStatus('disconnected');
      clearInterval(pingRef.current);
      // Reconnect after 3 s
      reconnectRef.current = setTimeout(() => {
        if (subscribedRef.current.length > 0) connectWs(subscribedRef.current);
      }, 3000);
    };
  }, []);

  // ── Trade data ─────────────────────────────────────────────────────────────

  const loadTrades = useCallback(async () => {
    const data = await fetchTrades();
    setTrades(data);
    setLoading(false);

    const contracts = [...new Set(data.filter(t => t.status === 'open').map(t => t.contract))];

    // (Re)subscribe WebSocket when open contracts change
    const prev = subscribedRef.current.slice().sort().join(',');
    const next = contracts.slice().sort().join(',');
    if (next !== prev) connectWs(contracts);
  }, [connectWs]);

  useEffect(() => {
    loadTrades();

    // Supabase Realtime — reload trade list on any DB change
    const channel = supabase
      ?.channel('trades-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, loadTrades)
      .subscribe();

    // Fallback poll every 30 s for trade list (WS handles prices)
    const poll = setInterval(loadTrades, 30000);

    return () => {
      channel && supabase?.removeChannel(channel);
      clearInterval(poll);
      clearInterval(pingRef.current);
      clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [loadTrades]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const EQUITY_START = 1000;

  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const wins = closed.filter(t => Number(t.pnl_usdt) > 0);
  const losses = closed.filter(t => Number(t.pnl_usdt) < 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;

  const openPnl = open.reduce((sum, trade) => {
    const entry = Number(trade.entry_price);
    const live = prices[trade.contract];
    const db = Number(trade.current_price);
    const current = (live > 0) ? live : (db > 0 ? db : entry);
    const isLong = trade.direction === 'long';
    return sum + (isLong ? current - entry : entry - current) * Number(trade.size);
  }, 0);

  const closedPnl = closed.reduce((sum, t) => sum + Number(t.pnl_usdt || 0), 0);
  const equity = EQUITY_START + closedPnl + openPnl;

  const avgWin = wins.length > 0
    ? wins.reduce((s, t) => s + Number(t.pnl_usdt), 0) / wins.length : 0;
  const avgLoss = losses.length > 0
    ? losses.reduce((s, t) => s + Number(t.pnl_usdt), 0) / losses.length : 0;
  const profitFactor = avgLoss !== 0
    ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : null;

  const wsColor = wsStatus === 'connected' ? '#00e87a' : wsStatus === 'error' ? '#ff4466' : '#ffaa00';
  const wsLabel = wsStatus === 'connected' ? 'WS Live' : wsStatus === 'error' ? 'WS Error' : 'WS Connecting…';

  const s = {
    dash: { background: '#0a0a0f', minHeight: '100vh', padding: 20, fontFamily: "'JetBrains Mono', monospace", color: '#e8e8f0' },
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

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '0.5px solid #1e1e2e' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: -1 }}>
            HPDR<span style={{ color: '#00e87a' }}>bot</span>
          </div>
          <div style={{ fontSize: 10, color: '#5a5a7a', marginTop: 2 }}>Paper Mode · x25 · Gate.io Perpetuals</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {/* WebSocket status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: wsColor, background: '#0d0d1a', border: `0.5px solid ${wsColor}44`, padding: '4px 10px', borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: wsColor, display: 'inline-block', animation: wsStatus === 'connected' ? 'pulse 2s infinite' : 'none' }} />
            {wsLabel}
            {lastTick && wsStatus === 'connected' && (
              <span style={{ color: '#5a5a7a', marginLeft: 4 }}>· {timeAgo(lastTick.toISOString())}</span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#5a5a7a', marginTop: 60, fontSize: 13 }}>Loading...</div>
      ) : (
        <>
          {/* Stats row 1 — equity */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 10 }}>
            {[
              ['Equity', `$${fmt(equity)}`, equity >= EQUITY_START ? '#00e87a' : '#ff4466'],
              ['Closed P&L', `${closedPnl >= 0 ? '+' : ''}$${fmt(closedPnl)}`, closedPnl >= 0 ? '#00e87a' : '#ff4466'],
              ['Open P&L', `${openPnl >= 0 ? '+' : ''}$${fmt(openPnl)}`, openPnl >= 0 ? '#00e87a' : '#ff4466'],
              ['Open now', open.length, '#ffaa00'],
            ].map(([label, val, color]) => (
              <div key={label} style={s.stat}>
                <div style={s.statLabel}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Stats row 2 — performance */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              ['Win rate', closed.length > 0 ? `${winRate}%` : '—', winRate >= 50 ? '#00e87a' : closed.length > 0 ? '#ff4466' : '#5a5a7a'],
              ['Trades', `${wins.length}W / ${losses.length}L`, '#4488ff'],
              ['Avg win', wins.length > 0 ? `+$${fmt(avgWin)}` : '—', '#00e87a'],
              ['Profit factor', profitFactor != null ? fmt(profitFactor) : '—', profitFactor != null && profitFactor >= 1 ? '#00e87a' : '#5a5a7a'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ ...s.stat, padding: 10 }}>
                <div style={s.statLabel}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Open positions */}
          <div style={{ marginBottom: 20 }}>
            <div style={s.sectionTitle}>Open positions ({open.length})</div>
            {open.length === 0
              ? <div style={{ color: '#5a5a7a', fontSize: 12, padding: '20px 0' }}>No open positions</div>
              : open.map(t => <PositionCard key={t.id} trade={t} livePrice={prices[t.contract]} onClose={loadTrades} />)
            }
          </div>

          {/* Closed trades */}
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
            {closed.length === 0
              ? <div style={{ color: '#5a5a7a', fontSize: 12, padding: '20px 0' }}>No closed trades yet</div>
              : (
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
              )
            }
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
      `}</style>
    </div>
  );
}
