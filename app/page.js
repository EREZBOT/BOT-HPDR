'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_KEY || ''
);

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(() => { fetchTrades(); setTime(new Date()); }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchTrades() {
    const { data } = await supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(50);
    if (data) setTrades(data);
  }

  const open = trades.filter(t => t.status === 'open');
  const closed = trades.filter(t => t.status !== 'open');
  const totalPnl = trades.reduce((s, t) => s + (t.pnl_usdt || 0), 0);
  const wins = closed.filter(t => t.pnl_usdt > 0).length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;

  return (
    <div style={{ background:'#0a0a0f', minHeight:'100vh', color:'#e0e0f0', fontFamily:"'Space Mono', monospace", padding:'24px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .pulse{animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        .bl{background:rgba(0,255,136,0.15);color:#00ff88}
        .bs{background:rgba(255,51,102,0.15);color:#ff3366}
        .badge{display:inline-block;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase}
        .bar{background:#1e1e2e;border-radius:4px;height:5px;flex:1}
        .card{background:#12121a;border:1px solid #1e1e2e;border-radius:12px;padding:16px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse}
        th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666680;padding:12px 16px;border-bottom:1px solid #1e1e2e}
        td{padding:14px 16px;border-bottom:1px solid #1e1e2e;font-size:13px}
        tr:hover td{background:#0d0d14}
      `}</style>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:28,borderBottom:'1px solid #1e1e2e',paddingBottom:20}}>
        <div style={{fontFamily:'Syne,sans-serif',fontSize:26,fontWeight:800,color:'#00ff88',letterSpacing:'-1px'}}>
          HPDR<span style={{color:'#e0e0f0',fontWeight:400}}>Bot</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <span style={{fontSize:12,color:'#666680'}}>{time.toLocaleString('en-US')}</span>
          <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#00ff88'}}>
            <span className="pulse" style={{width:7,height:7,background:'#00ff88',borderRadius:'50%',display:'inline-block'}}></span>
            LIVE
          </span>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:28}}>
        {[
          {label:'Total Trades',val:trades.length,color:'#4488ff'},
          {label:'Open Positions',val:open.length,color:'#ffd700'},
          {label:'Win Rate',val:`${winRate}%`,color:'#00ff88'},
          {label:'Total P&L',val:`${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}`,color:totalPnl>=0?'#00ff88':'#ff3366'},
          {label:'Closed Trades',val:closed.length,color:'#666680'},
        ].map((s,i)=>(
          <div key={i} style={{background:'#12121a',border:'1px solid #1e1e2e',borderRadius:12,padding:20}}>
            <div style={{fontSize:11,color:'#666680',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>{s.label}</div>
            <div style={{fontFamily:'Syne,sans-serif',fontSize:26,fontWeight:800,color:s.color}}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{marginBottom:28}}>
        <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'2px',color:'#666680',marginBottom:14}}>Open Positions ({open.length})</div>
        {open.length===0?(
          <div style={{textAlign:'center',padding:40,color:'#666680',background:'#12121a',borderRadius:12,border:'1px solid #1e1e2e'}}>No open positions</div>
        ):open.map(t=>(
          <div key={t.id} className="card">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span className={`badge ${t.direction==='long'?'bl':'bs'}`}>{t.direction==='long'?'▲ Long':'▼ Short'}</span>
                <span style={{fontSize:15,fontWeight:700}}>{t.contract}</span>
                <span style={{fontSize:11,color:'#666680'}}>{new Date(t.created_at).toLocaleString('en-US')}</span>
              </div>
              <span style={{fontSize:18,fontWeight:700,color:(t.pnl_usdt||0)>=0?'#00ff88':'#ff3366'}}>
                {(t.pnl_usdt||0)>=0?'+':''}${(t.pnl_usdt||0).toFixed(2)}
              </span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14}}>
              {[
                {label:'Entry',val:`$${parseFloat(t.entry_price).toFixed(2)}`},
                {label:'Size',val:t.size},
                {label:'Stop Loss',val:`$${parseFloat(t.sl_price||0).toFixed(2)}`,color:'#ff3366'},
                {label:'Stage',val:`${t.stage||0}/3`},
              ].map((f,i)=>(
                <div key={i}>
                  <div style={{fontSize:10,color:'#666680',marginBottom:3}}>{f.label}</div>
                  <div style={{fontSize:13,color:f.color||'#e0e0f0'}}>{f.val}</div>
                </div>
              ))}
            </div>
            {[
              {label:'TP1',color:'#00ff88',done:t.stage>=1},
              {label:'TP2',color:'#4488ff',done:t.stage>=2},
              {label:'TP3',color:'#ffd700',done:t.stage>=3},
            ].map((tp,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={{fontSize:10,color:'#666680',width:24}}>{tp.label}</span>
                <div className="bar">
                  <div style={{height:5,borderRadius:4,background:tp.color,width:tp.done?'100%':'20%',transition:'width 0.5s'}}></div>
                </div>
                {tp.done&&<span style={{fontSize:10,color:tp.color}}>✓</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div>
        <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'2px',color:'#666680',marginBottom:14}}>Trade History ({closed.length})</div>
        {closed.length===0?(
          <div style={{textAlign:'center',padding:40,color:'#666680',background:'#12121a',borderRadius:12,border:'1px solid #1e1e2e'}}>No closed trades yet</div>
        ):(
          <div style={{background:'#12121a',borderRadius:12,border:'1px solid #1e1e2e',overflow:'hidden'}}>
            <table>
              <thead><tr><th>Pair</th><th>Direction</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Reason</th><th>Date</th></tr></thead>
              <tbody>
                {closed.map(t=>(
                  <tr key={t.id}>
                    <td style={{fontWeight:700}}>{t.contract}</td>
                    <td><span className={`badge ${t.direction==='long'?'bl':'bs'}`}>{t.direction==='long'?'▲ Long':'▼ Short'}</span></td>
                    <td>${parseFloat(t.entry_price).toFixed(2)}</td>
                    <td>${parseFloat(t.exit_price||0).toFixed(2)}</td>
                    <td style={{color:(t.pnl_usdt||0)>=0?'#00ff88':'#ff3366',fontWeight:700}}>
                      {(t.pnl_usdt||0)>=0?'+':''}${parseFloat(t.pnl_usdt||0).toFixed(2)}
                    </td>
                    <td style={{color:'#666680',fontSize:11,textTransform:'uppercase'}}>{t.close_reason||'-'}</td>
                    <td style={{color:'#666680',fontSize:11}}>{new Date(t.created_at).toLocaleDateString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{marginTop:32,background:'#12121a',border:'1px solid #1e1e2e',borderRadius:12,padding:20}}>
        <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'2px',color:'#666680',marginBottom:12}}>TradingView Webhook URL</div>
        <div style={{background:'#0a0a0f',border:'1px solid #1e1e2e',borderRadius:8,padding:'12px 16px',fontSize:13,color:'#00ff88',wordBreak:'break-all'}}>
          https://bot-hpdr.vercel.app/api/webhook
        </div>
      </div>
    </div>
  );
}
