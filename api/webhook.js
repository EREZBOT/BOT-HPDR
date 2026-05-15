// HPDR Bot - Webhook Handler
// מקבל סיגנלים מ-TradingView ומבצע עסקאות ב-Gate.io

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── Supabase Client ────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Gate.io API ────────────────────────────────────────────────────────────────
const GATE_API_URL = 'https://fx.gate.io';
const GATE_KEY    = process.env.GATE_API_KEY;
const GATE_SECRET = process.env.GATE_SECRET;

function gateSign(method, url, queryString, body, timestamp) {
  const bodyHash = crypto.createHash('sha512').update(body || '').digest('hex');
  const msg = `${method}\n${url}\n${queryString || ''}\n${bodyHash}\n${timestamp}`;
  return crypto.createHmac('sha512', GATE_SECRET).update(msg).digest('hex');
}

async function gateRequest(method, path, params = {}, body = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const queryString = method === 'GET' ? new URLSearchParams(params).toString() : '';
  const bodyStr = body ? JSON.stringify(body) : '';
  const sign = gateSign(method, path, queryString, bodyStr, timestamp);

  const url = `${GATE_API_URL}${path}${queryString ? '?' + queryString : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'KEY': GATE_KEY,
      'SIGN': sign,
      'Timestamp': timestamp,
    },
    body: bodyStr || undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gate.io error: ${JSON.stringify(data)}`);
  return data;
}

// ── Get Account Balance ────────────────────────────────────────────────────────
async function getBalance() {
  const accounts = await gateRequest('GET', '/api/v4/futures/usdt/accounts');
  return parseFloat(accounts.available);
}

// ── Place Order ────────────────────────────────────────────────────────────────
async function placeOrder({ contract, size, price, tif = 'gtc', reduceOnly = false, close = false }) {
  return await gateRequest('POST', '/api/v4/futures/usdt/orders', {}, {
    contract,
    size,           // positive = long, negative = short
    price: price ? price.toString() : '0',
    tif,
    reduce_only: reduceOnly,
    close,
  });
}

// ── Close Position ─────────────────────────────────────────────────────────────
async function closePosition(contract, size, isLong) {
  // Close with market order in opposite direction
  return await gateRequest('POST', '/api/v4/futures/usdt/orders', {}, {
    contract,
    size: isLong ? -Math.abs(size) : Math.abs(size),
    price: '0',
    tif: 'ioc',
    reduce_only: true,
  });
}

// ── Get Current Price ──────────────────────────────────────────────────────────
async function getPrice(contract) {
  const ticker = await gateRequest('GET', '/api/v4/futures/usdt/tickers', { contract });
  return parseFloat(ticker[0].last);
}

// ── Save Trade to Supabase ─────────────────────────────────────────────────────
async function saveTrade(trade) {
  const { error } = await supabase.from('trades').insert([trade]);
  if (error) console.error('Supabase error:', error);
}

// ── Update Trade in Supabase ───────────────────────────────────────────────────
async function updateTrade(id, updates) {
  const { error } = await supabase.from('trades').update(updates).eq('id', id);
  if (error) console.error('Supabase update error:', error);
}

// ── Main Webhook Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      action,      // 'long' | 'short' | 'close_long' | 'close_short'
      symbol,      // e.g. 'BTC_USDT'
      sl_pct,      // stop loss %
      entry_price, // optional: from TradingView
    } = req.body;

    console.log(`📨 Signal received: ${action} ${symbol}`);

    // Convert TradingView symbol to Gate.io format
    // TradingView: BTCUSDT.P → Gate.io: BTC_USDT
    const contract = symbol
      .replace('USDT', '_USDT')
      .replace('.P', '')
      .replace('PERP', '')
      .toUpperCase();

    const price = await getPrice(contract);
    const balance = await getBalance();
    const QTY_PCT = 0.05; // 5% of balance per trade (matches Pine Script)
    const tradeCapital = balance * QTY_PCT;

    // ── LONG ENTRY ─────────────────────────────────────────────────────────────
    if (action === 'long') {
      const size = Math.floor(tradeCapital / price); // number of contracts
      if (size < 1) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Entry order (market)
      const order = await placeOrder({
        contract,
        size,
        price: '0',
        tif: 'ioc',
      });

      const entryPrice = price;
      const sl_val   = entryPrice * (1 - (sl_pct || 2.5) / 100);

      // Save to DB
      await saveTrade({
        contract,
        direction: 'long',
        entry_price: entryPrice,
        size,
        sl_price: sl_val,
        status: 'open',
        gate_order_id: order.id,
        created_at: new Date().toISOString(),
      });

      console.log(`✅ Long opened: ${contract} @ ${entryPrice}, SL: ${sl_val}`);
      return res.status(200).json({ 
        success: true, 
        action: 'long_opened',
        contract, 
        entry: entryPrice, 
        sl: sl_val,
        size 
      });
    }

    // ── SHORT ENTRY ────────────────────────────────────────────────────────────
    if (action === 'short') {
      const size = Math.floor(tradeCapital / price);
      if (size < 1) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      const order = await placeOrder({
        contract,
        size: -size, // negative = short
        price: '0',
        tif: 'ioc',
      });

      const entryPrice = price;
      const sl_val = entryPrice * (1 + (sl_pct || 2.5) / 100);

      await saveTrade({
        contract,
        direction: 'short',
        entry_price: entryPrice,
        size,
        sl_price: sl_val,
        status: 'open',
        gate_order_id: order.id,
        created_at: new Date().toISOString(),
      });

      console.log(`✅ Short opened: ${contract} @ ${entryPrice}, SL: ${sl_val}`);
      return res.status(200).json({ 
        success: true, 
        action: 'short_opened',
        contract, 
        entry: entryPrice, 
        sl: sl_val,
        size 
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
