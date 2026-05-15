import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function Dashboard() {
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: stats } = await supabase
    .from('trade_stats')
    .select('*')
    .single();

  const openTrades = trades?.filter(t => t.status === 'open') || [];
  const closedTrades = trades?.filter(t => t.status !== 'open') || [];

  return (
    <html>
      <head>
        <title>HPDR Bot Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap');
          
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          :root {
            --bg: #0a0a0f;
            --surface: #12121a;
            --border: #1e1e2e;
            --green: #00ff88;
            --red: #ff3366;
            --blue: #4488ff;
            --yellow: #ffd700;
            --text: #e0e0f0;
            --muted: #666680;
          }

          body {
            background: var(--bg);
            color: var(--text);
            font-family: 'Space Mono', monospace;
            min-height: 100vh;
            padding: 24px;
          }

          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 32px;
            border-bottom: 1px solid var(--border);
            padding-bottom: 20px;
          }

          .logo {
            font-family: 'Syne', sans-serif;
            font-size: 28px;
            font-weight: 800;
            color: var(--green);
            letter-spacing: -1px;
          }

          .logo span { color: var(--text); }

          .status-dot {
            width: 8px; height: 8px;
            background: var(--green);
            border-radius: 50%;
            display: inline-block;
            margin-right: 8px;
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 32px;
          }

          .stat-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
          }

          .stat-label {
            font-size: 11px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }

          .stat-value {
            font-family: 'Syne', sans-serif;
            font-size: 28px;
            font-weight: 800;
          }

          .stat-value.green { color: var(--green); }
          .stat-value.red { color: var(--red); }
          .stat-value.blue { color: var(--blue); }
          .stat-value.yellow { color: var(--yellow); }

          .section-title {
            font-family: 'Syne', sans-serif;
            font-size: 14px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: var(--muted);
            margin-bottom: 16px;
          }

          .trades-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }

          .trades-table th {
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--muted);
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
          }

          .trades-table td {
            padding: 14px 16px;
            border-bottom: 1px solid var(--border);
            font-size: 13px;
          }

          .trades-table tr:hover td {
            background: var(--surface);
          }

          .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
          }

          .badge.long { background: rgba(0,255,136,0.15); color: var(--green); }
          .badge.short { background: rgba(255,51,102,0.15); color: var(--red); }
          .badge.open { background: rgba(68,136,255,0.15); color: var(--blue); }
          .badge.closed { background: rgba(102,102,128,0.15); color: var(--muted); }
          .badge.sl_hit { background: rgba(255,51,102,0.15); color: var(--red); }

          .pnl.positive { color: var(--green); }
          .pnl.negative { color: var(--red); }

          .no-trades {
            text-align: center;
            padding: 40px;
            color: var(--muted);
            font-size: 14px;
          }

          .webhook-info {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 24px;
            margin-top: 32px;
          }

          .webhook-url {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px 16px;
            font-size: 13px;
            color: var(--green);
            margin-top: 12px;
            word-break: break-all;
          }

          .section { margin-bottom: 32px; }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div className="logo">HPDR<span>Bot</span></div>
          <div>
            <span className="status-dot"></span>
            <span style={{fontSize: '13px', color: 'var(--muted)'}}>Live</span>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">סה"כ עסקאות</div>
            <div className="stat-value blue">{stats?.total_trades || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">עסקאות פתוחות</div>
            <div className="stat-value yellow">{stats?.open_trades || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">אחוז זכיות</div>
            <div className="stat-value green">{stats?.win_rate_pct || 0}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">רווח כולל</div>
            <div className={`stat-value ${(stats?.total_pnl || 0) >= 0 ? 'green' : 'red'}`}>
              ${stats?.total_pnl || '0.00'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">ממוצע לעסקה</div>
            <div className={`stat-value ${(stats?.avg_pnl || 0) >= 0 ? 'green' : 'red'}`}>
              ${stats?.avg_pnl || '0.00'}
            </div>
          </div>
        </div>

        {/* Open Trades */}
        <div className="section">
          <div className="section-title">עסקאות פתוחות ({openTrades.length})</div>
          {openTrades.length === 0 ? (
            <div className="no-trades">אין עסקאות פתוחות כרגע</div>
          ) : (
            <table className="trades-table">
              <thead>
                <tr>
                  <th>מטבע</th>
                  <th>כיוון</th>
                  <th>מחיר כניסה</th>
                  <th>SL</th>
                  <th>גודל</th>
                  <th>תאריך</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map(t => (
                  <tr key={t.id}>
                    <td>{t.contract}</td>
                    <td><span className={`badge ${t.direction}`}>{t.direction === 'long' ? '▲ Long' : '▼ Short'}</span></td>
                    <td>${parseFloat(t.entry_price).toFixed(2)}</td>
                    <td style={{color: 'var(--red)'}}>${parseFloat(t.sl_price || 0).toFixed(2)}</td>
                    <td>{t.size}</td>
                    <td style={{color: 'var(--muted)', fontSize: '12px'}}>{new Date(t.created_at).toLocaleString('he-IL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Closed Trades */}
        <div className="section">
          <div className="section-title">היסטוריית עסקאות ({closedTrades.length})</div>
          {closedTrades.length === 0 ? (
            <div className="no-trades">אין היסטוריית עסקאות עדיין</div>
          ) : (
            <table className="trades-table">
              <thead>
                <tr>
                  <th>מטבע</th>
                  <th>כיוון</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>P&L</th>
                  <th>סיבת סגירה</th>
                  <th>תאריך</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map(t => (
                  <tr key={t.id}>
                    <td>{t.contract}</td>
                    <td><span className={`badge ${t.direction}`}>{t.direction === 'long' ? '▲ Long' : '▼ Short'}</span></td>
                    <td>${parseFloat(t.entry_price).toFixed(2)}</td>
                    <td>${parseFloat(t.exit_price || 0).toFixed(2)}</td>
                    <td className={`pnl ${(t.pnl_usdt || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {(t.pnl_usdt || 0) >= 0 ? '+' : ''}${parseFloat(t.pnl_usdt || 0).toFixed(2)}
                    </td>
                    <td><span className={`badge ${t.close_reason === 'sl' ? 'sl_hit' : 'closed'}`}>{t.close_reason || '-'}</span></td>
                    <td style={{color: 'var(--muted)', fontSize: '12px'}}>{new Date(t.created_at).toLocaleString('he-IL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Webhook Info */}
        <div className="webhook-info">
          <div className="section-title">כתובת Webhook ל-TradingView</div>
          <p style={{fontSize: '13px', color: 'var(--muted)', marginTop: '8px'}}>
            הכנס את הכתובת הזו בהגדרות Alert ב-TradingView:
          </p>
          <div className="webhook-url">
            https://YOUR-PROJECT.vercel.app/api/webhook
          </div>
        </div>
      </body>
    </html>
  );
}
