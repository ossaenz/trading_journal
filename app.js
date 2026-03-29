/* ═══════════════════════════════════════════════════════════════════
   APEX TRADING DASHBOARD — app.js [ENHANCED]
   Charles Schwab API Integration + Advanced Analytics Engine
═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── STATE ─────────────────────────────────────────────────────────────
const State = {
  accessToken:      null,
  refreshToken:     null,
  tokenExpiry:      null,
  accounts:         [],
  positions:        [],
  orders:           [],
  quotes:           {},
  notes:            {},
  currentPage:      'dashboard',
  timeframe:        '1M',
  currentYear:      new Date().getFullYear(),
  goals:            [],
  settings:         {},
  charts:           {},
  ordersPage:       1,
  ordersFiltered:   [],
  journalTagFilter: 'ALL',
  currentRating:    0,
  modalTradeData:   null,
};

// ── INIT ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadNotes();
  checkAuthCallback();
  const token = localStorage.getItem('apex_access_token');
  if (token) {
    State.accessToken  = token;
    State.refreshToken = localStorage.getItem('apex_refresh_token');
    State.tokenExpiry  = parseInt(localStorage.getItem('apex_token_expiry') || '0');
    showApp();
    syncData();
  }
});

// ── AUTH ───────────────────────────────────────────────────────────────
function handleLogin() {
  window.location.href = '/api/auth?action=login';
}

function checkAuthCallback() {
  const hash = window.location.hash;
  if (!hash.includes('access_token=')) return;

  const params = new URLSearchParams(hash.slice(1));
  const access  = params.get('access_token');
  const refresh = params.get('refresh_token');
  const expIn   = parseInt(params.get('expires_in') || '1800');

  if (!access) return;

  State.accessToken  = access;
  State.refreshToken = refresh;
  State.tokenExpiry  = Date.now() + expIn * 1000;

  localStorage.setItem('apex_access_token',  access);
  localStorage.setItem('apex_refresh_token', refresh);
  localStorage.setItem('apex_token_expiry',  State.tokenExpiry.toString());

  window.history.replaceState({}, '', '/');
  showApp();
  syncData();
}

async function ensureToken() {
  if (!State.tokenExpiry || Date.now() > State.tokenExpiry - 60000) {
    try {
      const r = await fetch('/api/auth?action=refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: State.refreshToken }),
      });
      const data = await r.json();
      if (data.access_token) {
        State.accessToken = data.access_token;
        State.tokenExpiry = Date.now() + (data.expires_in || 1800) * 1000;
        localStorage.setItem('apex_access_token', data.access_token);
        localStorage.setItem('apex_token_expiry', State.tokenExpiry.toString());
      }
    } catch (e) { console.warn('Token refresh failed', e); }
  }
}

function logout() {
  ['apex_access_token','apex_refresh_token','apex_token_expiry'].forEach(k => localStorage.removeItem(k));
  Object.assign(State, { accessToken: null, refreshToken: null, accounts: [], positions: [], orders: [] });
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').classList.add('show');
}

// ── API CALLS ──────────────────────────────────────────────────────────
async function api(endpoint, params = {}) {
  await ensureToken();
  const qs   = new URLSearchParams(params).toString();
  const url  = `/api/schwab?endpoint=${encodeURIComponent(endpoint)}${qs ? '&' + qs : ''}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${State.accessToken}` },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `API error ${resp.status}`);
  }
  return resp.json();
}

// ── SYNC ───────────────────────────────────────────────────────────────
async function syncData() {
  const btn = document.querySelector('.sync-btn');
  btn?.classList.add('spinning');
  showToast('Syncing with Schwab...', '');

  try {
    // 1. Fetch accounts
    const accts = await api('/trader/v1/accounts');
    State.accounts = Array.isArray(accts) ? accts : [accts];

    const primary = State.accounts[0];
    const acctNum = primary?.securitiesAccount?.accountNumber || 'N/A';
    document.getElementById('sidebar-account').textContent = maskAcct(acctNum);
    document.getElementById('acct-num').textContent = maskAcct(acctNum);
    updateConnectionStatus(true);

    // 2. Fetch positions
    const posData = await api(`/trader/v1/accounts/${acctNum}`, { fields: 'positions' });
    State.positions = posData?.securitiesAccount?.positions || [];

    // 3. Fetch orders (last 365 days)
    const fromDate = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
    const toDate   = new Date().toISOString().split('T')[0];
    const orders   = await api('/trader/v1/orders', {
      accountNumber: acctNum,
      fromEnteredTime: fromDate + 'T00:00:00Z',
      toEnteredTime:   toDate   + 'T23:59:59Z',
      maxResults: 500,
      status: 'FILLED',
    });
    State.orders = Array.isArray(orders) ? orders : [];

    // 4. Fetch live quotes for positions
    fetchQuotes();

    // Cache data
    localStorage.setItem('apex_positions', JSON.stringify(State.positions));
    localStorage.setItem('apex_orders',    JSON.stringify(State.orders));
    localStorage.setItem('apex_last_sync', new Date().toLocaleString());
    document.getElementById('last-sync').textContent = new Date().toLocaleString();

    refreshAllViews();
    showToast('Sync complete ✓', 'success');
  } catch (err) {
    console.error(err);
    loadCachedOrDemo();
    updateConnectionStatus(false);
    showToast('Using cached / demo data — ' + err.message, 'error');
  } finally {
    btn?.classList.remove('spinning');
  }
}

function updateConnectionStatus(connected) {
  const status = document.getElementById('conn-status');
  const dot = document.getElementById('sidebar-dot');
  if (connected) {
    status.textContent = '● Connected';
    status.style.color = 'var(--green)';
    if (dot) dot.style.background = 'var(--green)';
  } else {
    status.textContent = '● Offline (cached)';
    status.style.color = 'var(--orange)';
    if (dot) dot.style.background = 'var(--orange)';
  }
}

async function fetchQuotes() {
  const symbols = State.positions.map(p => p.symbol).filter(Boolean).join(',');
  if (!symbols) return;
  try {
    const quotes = await api('/marketdata/v1/quotes', { symbols });
    if (quotes && typeof quotes === 'object') {
      State.quotes = quotes;
    }
  } catch (e) { console.warn('Quote fetch failed', e); }
}

function loadCachedOrDemo() {
  const cachedPos = localStorage.getItem('apex_positions');
  const cachedOrd = localStorage.getItem('apex_orders');
  if (cachedPos) State.positions = JSON.parse(cachedPos);
  if (cachedOrd) State.orders    = JSON.parse(cachedOrd);
  if (!State.orders.length) State.orders = generateDemoOrders();
  if (!State.positions.length) State.positions = generateDemoPositions();
  refreshAllViews();
}

// ── DEMO DATA ──────────────────────────────────────────────────────────
function generateDemoOrders() {
  const symbols  = ['AAPL','MSFT','NVDA','TSLA','AMZN','META','GOOGL','SPY','QQQ','AMD'];
  const orders   = [];
  const now      = Date.now();

  for (let i = 0; i < 120; i++) {
    const sym    = symbols[Math.floor(Math.random() * symbols.length)];
    const date   = new Date(now - Math.random() * 365 * 86400000);
    const price  = 100 + Math.random() * 400;
    const qty    = Math.ceil(Math.random() * 20);
    const pnl    = (Math.random() - 0.38) * price * qty * 0.15;
    orders.push({
      _demo: true,
      symbol: sym,
      enteredTime: date.toISOString(),
      orderType: 'MARKET',
      instruction: Math.random() > 0.5 ? 'BUY' : 'SELL',
      quantity: qty,
      price: price.toFixed(2),
      total: (price * qty).toFixed(2),
      status: 'FILLED',
      assetType: Math.random() > 0.85 ? 'OPTION' : 'EQUITY',
      realizedPL: pnl.toFixed(2),
      fees: [{ feeType: Math.random() > 0.85 ? 'COMMISSION' : 'OPTION_REGULATORY_FEE',
               amount: (Math.random() > 0.85 ? (qty * 0.65).toFixed(2) : '0.00') }],
    });
  }
  return orders.sort((a,b) => new Date(b.enteredTime) - new Date(a.enteredTime));
}

function generateDemoPositions() {
  return [
    { symbol:'AAPL', assetType:'EQUITY', longQuantity:15, averagePrice:172.3, marketValue:2685, currentDayProfitLoss:45.2, longOpenProfitLoss:210.5 },
    { symbol:'NVDA', assetType:'EQUITY', longQuantity:8,  averagePrice:498.7, marketValue:4680, currentDayProfitLoss:128.4, longOpenProfitLoss:870.4 },
    { symbol:'MSFT', assetType:'EQUITY', longQuantity:10, averagePrice:378.2, marketValue:3920, currentDayProfitLoss:-22.1, longOpenProfitLoss:178.0 },
    { symbol:'SPY',  assetType:'EQUITY', longQuantity:5,  averagePrice:510.0, marketValue:2590, currentDayProfitLoss:10.5,  longOpenProfitLoss:40.0  },
    { symbol:'TSLA', assetType:'EQUITY', longQuantity:12, averagePrice:195.4, marketValue:2136, currentDayProfitLoss:-87.6, longOpenProfitLoss:-216.0 },
  ];
}

// ── FEE EXTRACTION ────────────────────────────────────────────────────
// Schwab API stores fees in order.fees[].amount
// Options: $0.65/contract; Stocks: $0 at Schwab; regulatory fees may apply
function getFee(order) {
  if (order.fees && Array.isArray(order.fees)) {
    return order.fees.reduce((s, f) => s + parseFloat(f.amount || 0), 0);
  }
  // Fallback: check executionLegs for commission
  const legs = order.orderActivityCollection?.[0]?.executionLegs || [];
  return legs.reduce((s, l) => s + parseFloat(l.commission || 0), 0);
}

// ── VIEWS ──────────────────────────────────────────────────────────────
function refreshAllViews() {
  if (!State.positions.length) State.positions = generateDemoPositions();
  renderDashboard();
  renderPositions();
  renderOrdersPage(State.orders, 1);
  renderPerformance();
  renderYoY();
  renderInsights();
  renderGoals();
  renderTax();
  renderRiskPage();
  renderJournal();
  renderTickerTape();
}

// ── DASHBOARD ──────────────────────────────────────────────────────────
function renderDashboard() {
  const orders = filterByTimeframe(State.orders);
  const closed = orders.filter(o => parseFloat(o.realizedPL || 0) !== 0);
  const pnl    = closed.reduce((s,o) => s + parseFloat(o.realizedPL || 0), 0);
  const wins   = closed.filter(o => parseFloat(o.realizedPL) > 0);
  const losses = closed.filter(o => parseFloat(o.realizedPL) < 0);
  const winPct = closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : 0;
  const grossP = wins.reduce((s,o)   => s + parseFloat(o.realizedPL), 0);
  const grossL = Math.abs(losses.reduce((s,o) => s + parseFloat(o.realizedPL), 0));
  const pf     = grossL ? (grossP / grossL).toFixed(2) : '∞';
  const portVal = State.positions.reduce((s,p) => s + (p.marketValue || 0), 0);
  const sharpe = calcSharpe(closed);

  // MAX DRAWDOWN & STREAK
  const dd = calcMaxDrawdown(closed);
  const streak = calcCurrentStreak(closed);

  setEl('kpi-pnl',           fmt(pnl));
  setEl('kpi-pnl-delta',     `${pnl >= 0 ? '▲' : '▼'} ${winPct}% win rate`);
  setEl('kpi-portfolio',     fmt(portVal));
  setEl('kpi-winrate',       winPct + '%');
  setEl('kpi-winrate-delta', `${wins.length} of ${closed.length} trades`);
  setEl('kpi-pf',            pf);
  setEl('kpi-pf-delta',      `${fmt(grossP)} gross profit`);
  setEl('kpi-drawdown',      '$' + fmt(Math.abs(dd.dollar)));
  setEl('kpi-drawdown-pct',  (dd.pct*100).toFixed(1) + '%');
  setEl('kpi-streak',        streak.count);
  setEl('kpi-streak-label',  streak.count + ' ' + (streak.type === 'win' ? 'Wins' : 'Losses'));
  setEl('streak-display',    `${streak.count}${streak.type[0].toUpperCase()}`);

  const totalFees = orders.reduce((s,o) => s + getFee(o), 0);
  const netPnl     = pnl - totalFees;

  setEl('stat-trades',       closed.length);
  setEl('stat-avgwin',       '$' + fmt(wins.length ? (grossP / wins.length) : 0));
  setEl('stat-avgloss',      '-$' + fmt(losses.length ? (grossL / losses.length) : 0));
  setEl('stat-best',         fmt(Math.max(...closed.map(o=>parseFloat(o.realizedPL||0)))));
  setEl('stat-worst',        fmt(Math.min(...closed.map(o=>parseFloat(o.realizedPL||0)))));
  setEl('stat-sharpe',       sharpe.toFixed(2));
  setEl('stat-fees',         '-' + fmt(totalFees));

  // Color KPIs
  document.getElementById('kpi-pnl').style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('kpi-drawdown').style.color = 'var(--red)';
  document.getElementById('kpi-streak').style.color = streak.type === 'win' ? 'var(--green)' : 'var(--red)';

  renderEquityChart(closed);
  renderAllocationChart();
  renderMonthlyChart(closed);
  renderHistogram(closed);
  renderDrawdownChart(closed);
}

// ── DRAWDOWN CHART & CALCULATION ───────────────────────────────────────
function calcMaxDrawdown(trades) {
  const sorted = [...trades].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  let cumPL = 0, peakPL = 0, maxDD = 0;
  let maxDDDollar = 0;

  sorted.forEach(t => {
    cumPL += parseFloat(t.realizedPL || 0);
    if (cumPL > peakPL) peakPL = cumPL;
    const dd = peakPL - cumPL;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDDollar = dd;
    }
  });

  return {
    dollar: maxDDDollar,
    pct: peakPL ? (maxDD / peakPL) : 0,
    peak: peakPL,
  };
}

function renderDrawdownChart(trades) {
  const sorted = [...trades].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  let cumPL = 0, peakPL = 0;
  const labels = [], dataDD = [];

  sorted.forEach(t => {
    cumPL += parseFloat(t.realizedPL || 0);
    if (cumPL > peakPL) peakPL = cumPL;
    const dd = peakPL - cumPL;
    labels.push(new Date(t.enteredTime).toLocaleDateString());
    dataDD.push((dd > 0 ? -dd : 0));
  });

  destroyChart('drawdownChart');
  const ctx = document.getElementById('drawdownChart');
  if (!ctx) return;

  State.charts.drawdown = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Drawdown',
        data: dataDD,
        backgroundColor: 'rgba(255,61,92,.6)',
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      ...chartOpts({ prefix: '$', title: '' }),
      scales: {
        y: {
          ...gridStyle(),
          ticks: {
            ...gridStyle().ticks,
            callback: v => prefix + v.toLocaleString(),
          },
        },
      },
    },
  });
}

// ── STREAK CALCULATION ─────────────────────────────────────────────────
function calcCurrentStreak(trades) {
  const sorted = [...trades].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  let curStreak = 0, curType = null, maxStreak = 0, maxType = 'win';

  sorted.reverse().forEach(t => {
    const isWin = parseFloat(t.realizedPL) > 0;
    if (curType === null) {
      curType = isWin ? 'win' : 'loss';
      curStreak = 1;
    } else if ((curType === 'win' && isWin) || (curType === 'loss' && !isWin)) {
      curStreak++;
    } else {
      if (curStreak > maxStreak) {
        maxStreak = curStreak;
        maxType = curType;
      }
      curType = isWin ? 'win' : 'loss';
      curStreak = 1;
    }
  });

  if (curStreak > maxStreak) {
    maxStreak = curStreak;
    maxType = curType;
  }

  return { count: maxStreak, type: maxType };
}

// ── TICKER TAPE ────────────────────────────────────────────────────────
function renderTickerTape() {
  const tape = document.getElementById('ticker-inner');
  if (!tape) return;

  const items = State.positions.slice(0, 15).map(p => {
    const qty = p.longQuantity || p.shortQuantity || 0;
    const mv = p.marketValue || 0;
    const dayChg = p.currentDayProfitLoss || 0;
    const price = qty ? (mv / qty) : 0;
    const pctChg = price && p.averagePrice ? (((price - p.averagePrice) / p.averagePrice) * 100) : 0;

    return `<div class="ticker-item">
      <span class="ticker-sym">${p.symbol}</span>
      <span class="ticker-price">$${price.toFixed(2)}</span>
      <span class="${dayChg >= 0 ? 'ticker-up' : 'ticker-down'}">${dayChg >= 0 ? '▲' : '▼'} ${Math.abs(pctChg).toFixed(1)}%</span>
    </div>`;
  }).join('');

  tape.innerHTML = items + items; // Duplicate for seamless loop
  if (State.positions.length) {
    document.getElementById('ticker-wrap').style.display = 'block';
  }
}

// ── EQUITY CHART ───────────────────────────────────────────────────────
function renderEquityChart(trades) {
  const sorted = [...trades].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  let cumPL = 0;
  const labels = [], data = [];
  sorted.forEach(t => {
    cumPL += parseFloat(t.realizedPL || 0);
    labels.push(new Date(t.enteredTime).toLocaleDateString());
    data.push(parseFloat(cumPL.toFixed(2)));
  });

  destroyChart('equityChart');
  const ctx = document.getElementById('equityChart').getContext('2d');
  const isPos = data[data.length - 1] >= 0;
  const color = isPos ? '#00e5a0' : '#ff4466';

  State.charts.equity = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: (ctx2) => {
          const g = ctx2.chart.ctx.createLinearGradient(0,0,0,300);
          g.addColorStop(0, isPos ? 'rgba(0,229,160,.25)' : 'rgba(255,68,102,.25)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          return g;
        },
        tension: 0.4,
      }],
    },
    options: chartOpts({ prefix: '$', title: '' }),
  });
}

// ── ALLOCATION CHART ───────────────────────────────────────────────────
function renderAllocationChart() {
  const byType = {};
  State.positions.forEach(p => {
    const t = p.assetType || 'EQUITY';
    byType[t] = (byType[t] || 0) + (p.marketValue || 0);
  });
  if (!Object.keys(byType).length) return;

  destroyChart('allocationChart');
  const ctx = document.getElementById('allocationChart').getContext('2d');
  State.charts.allocation = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(byType),
      datasets: [{
        data: Object.values(byType),
        backgroundColor: ['#00d4ff','#00e5a0','#9d7af5','#f5c518','#ff4466'],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#5a7a96', font: { family: 'Space Mono', size: 10 }, padding: 12 } },
        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmt(c.raw)}` } },
      },
      cutout: '65%',
    },
  });
}

// ── MONTHLY CHART ──────────────────────────────────────────────────────
function renderMonthlyChart(trades) {
  const monthly = {};
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  trades.forEach(t => {
    const d = new Date(t.enteredTime);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    monthly[k] = (monthly[k] || 0) + parseFloat(t.realizedPL || 0);
  });

  const year  = new Date().getFullYear();
  const labels = months.map((m,i) => m);
  const data   = months.map((_,i) => monthly[`${year}-${i}`] || 0);
  const colors = data.map(v => v >= 0 ? 'rgba(0,229,160,.8)' : 'rgba(255,68,102,.8)');

  destroyChart('monthlyChart');
  const ctx = document.getElementById('monthlyChart').getContext('2d');
  State.charts.monthly = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, borderSkipped: false }] },
    options: chartOpts({ prefix: '$', title: '' }),
  });
}

// ── HISTOGRAM ─────────────────────────────────────────────────────────
function renderHistogram(trades) {
  const pls  = trades.map(t => parseFloat(t.realizedPL || 0));
  if (!pls.length) return;
  const min  = Math.min(...pls);
  const max  = Math.max(...pls);
  const bins = 12;
  const step = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  const labels = [];

  for (let i = 0; i < bins; i++) {
    const lo = min + i * step;
    const hi = lo + step;
    labels.push(`$${lo.toFixed(0)}`);
    counts[i] = pls.filter(p => p >= lo && p < hi).length;
  }

  const colors = labels.map(l => parseFloat(l.replace('$','')) >= 0 ? 'rgba(0,229,160,.7)' : 'rgba(255,68,102,.7)');

  destroyChart('histogramChart');
  const ctx = document.getElementById('histogramChart').getContext('2d');
  State.charts.histogram = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 3 }] },
    options: chartOpts({ title: '' }),
  });
}

// ── POSITIONS ──────────────────────────────────────────────────────────
function renderPositions() {
  const positions = State.positions;
  let totalUnreal = 0, totalDay = 0, totalMV = 0;

  const rows = positions.map(p => {
    const qty    = p.longQuantity || p.shortQuantity || 0;
    const avg    = parseFloat(p.averagePrice || 0);
    const mv     = parseFloat(p.marketValue || 0);
    const curr   = qty ? (mv / qty) : 0;
    const unrealP= parseFloat(p.longOpenProfitLoss || 0);
    const dayChg = parseFloat(p.currentDayProfitLoss || 0);
    const pct    = avg ? (((curr - avg) / avg) * 100) : 0;
    const portPct = totalMV ? ((mv / totalMV) * 100) : 0;
    totalUnreal += unrealP;
    totalDay    += dayChg;
    totalMV     += mv;

    return `<tr>
      <td><strong>${p.symbol || '—'}</strong></td>
      <td><span class="badge ${p.assetType==='OPTION'?'badge-option':'badge-buy'}">${p.assetType||'EQUITY'}</span></td>
      <td>${qty.toLocaleString()}</td>
      <td>$${avg.toFixed(2)}</td>
      <td>$${curr.toFixed(2)}</td>
      <td>$${mv.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
      <td class="${unrealP>=0?'profit':'loss'}">${unrealP>=0?'+':''}$${Math.abs(unrealP).toFixed(2)}</td>
      <td class="${pct>=0?'profit':'loss'}">${pct>=0?'+':''}${pct.toFixed(2)}%</td>
      <td>${portPct.toFixed(1)}%</td>
    </tr>`;
  }).join('');

  document.getElementById('positions-body').innerHTML = rows || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">No open positions</td></tr>';
  
  setEl('pos-count',       positions.length);
  setEl('pos-unrealized',  fmt(totalUnreal));
  setEl('pos-unrealized-pct', (totalUnreal >= 0 ? '▲' : '▼') + ' ' + (totalUnreal*100/totalMV || 0).toFixed(2) + '%');
  setEl('pos-daychange',   fmt(totalDay));

  document.getElementById('pos-unrealized').className = 'kpi-value ' + (totalUnreal >= 0 ? 'profit' : 'loss');
  document.getElementById('pos-daychange').className  = 'kpi-value ' + (totalDay >= 0 ? 'profit' : 'loss');

  renderConcentrationChart();
}

// ── CONCENTRATION CHART ────────────────────────────────────────────────
function renderConcentrationChart() {
  const positions = State.positions;
  const totalMV = positions.reduce((s,p) => s + (p.marketValue || 0), 0);
  if (!totalMV) return;

  const data = positions
    .map(p => ({ symbol: p.symbol, pct: ((p.marketValue || 0) / totalMV) * 100 }))
    .sort((a,b) => b.pct - a.pct)
    .slice(0, 10);

  destroyChart('concentrationChart');
  const ctx = document.getElementById('concentrationChart');
  if (!ctx) return;

  State.charts.concentration = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.symbol),
      datasets: [{
        data: data.map(d => d.pct),
        backgroundColor: 'rgba(0,212,255,.6)',
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      ...chartOpts({ suffix: '%', title: '' }),
      scales: {
        x: {
          ...gridStyle(),
          ticks: { ...gridStyle().ticks, callback: v => v.toFixed(1) + '%' },
        },
      },
    },
  });
}

// ── TRADE LOG / ORDERS PAGE ────────────────────────────────────────────
function applyTradeFilters() {
  const typeFilter = document.getElementById('tl-type-filter').value;
  const sideFilter = document.getElementById('tl-side-filter').value;
  const symFilter = document.getElementById('tl-sym-filter').value.toLowerCase();

  State.ordersFiltered = State.orders
    .filter(o => !typeFilter || o.assetType === typeFilter)
    .filter(o => !sideFilter || (o.instruction || '').includes(sideFilter))
    .filter(o => !symFilter || (o.symbol || '').toLowerCase().includes(symFilter));

  State.ordersPage = 1;
  renderOrdersPage(State.ordersFiltered, 1);
}

function renderOrdersPage(trades, page = 1) {
  const pageSize = 20;
  const filtered = trades.length ? trades : State.orders;
  const total = filtered.length;
  const pages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageTrades = filtered.slice(start, end);

  const rows = pageTrades.map(o => {
    const pnl  = parseFloat(o.realizedPL || 0);
    const fee  = getFee(o);
    const sym  = o.symbol || (o.orderLegCollection?.[0]?.instrument?.symbol) || '—';
    const inst = o.instruction || o.orderLegCollection?.[0]?.instruction || 'BUY';
    const qty  = o.quantity || o.orderLegCollection?.[0]?.quantity || '—';
    const price= parseFloat(o.price || o.orderActivityCollection?.[0]?.executionLegs?.[0]?.price || 0);
    const total= parseFloat(o.total || (price * parseFloat(qty)) || 0);
    const notes = State.notes[o.symbol + '|' + o.enteredTime] || {};
    const tagStr = notes.tags ? notes.tags.map(t => `<span class="tag tag-${t}">${t}</span>`).join('') : '';

    return `<tr onclick="openTradeModal('${sym}','${new Date(o.enteredTime).toISOString()}')">
      <td>${new Date(o.enteredTime).toLocaleDateString()}</td>
      <td><strong>${sym}</strong></td>
      <td><span class="badge ${o.assetType==='OPTION'?'badge-option':'badge-buy'}">${o.assetType||'EQ'}</span></td>
      <td><span class="badge ${inst.includes('BUY')?'badge-buy':'badge-sell'}">${inst}</span></td>
      <td>${qty}</td>
      <td>$${price.toFixed(2)}</td>
      <td>$${Math.abs(total).toLocaleString('en',{minimumFractionDigits:2})}</td>
      <td><span class="badge badge-closed">FILLED</span></td>
      <td class="${pnl>=0?'profit':'loss'}">${pnl!==0?(pnl>=0?'+':'')+fmt(pnl):'—'}</td>
      <td class="loss" style="font-size:11px">${fee>0?'-$'+fee.toFixed(2):'—'}</td>
      <td>${tagStr || '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('orders-body').innerHTML = rows || '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:40px">No trades found</td></tr>';

  // KPIs
  const closed = filtered.filter(o => parseFloat(o.realizedPL || 0) !== 0);
  const pnl = closed.reduce((s,o) => s + parseFloat(o.realizedPL || 0), 0);
  const wins = closed.filter(o => parseFloat(o.realizedPL) > 0);
  const winPct = closed.length ? (wins.length / closed.length * 100).toFixed(1) : 0;
  const avgTrade = closed.length ? (pnl / closed.length).toFixed(0) : 0;
  const totalFees = filtered.reduce((s,o) => s + getFee(o), 0);

  setEl('tl-count', total);
  setEl('tl-pnl', fmt(pnl));
  setEl('tl-wr', winPct + '%');
  setEl('tl-avg', '$' + fmt(avgTrade));
  setEl('tl-fees', '-' + fmt(totalFees));

  // Pagination
  const pageInfo = document.getElementById('orders-page-info');
  const pageBtn = document.getElementById('orders-page-btns');
  if (pageInfo) pageInfo.textContent = `Page ${page} of ${pages} (${total} total)`;

  if (pageBtn) {
    let btnHTML = '<button class="page-btn ' + (page===1?'disabled':'') + '" onclick="renderOrdersPage(State.ordersFiltered||State.orders,' + (page-1) + ')">← Prev</button>';
    for (let p = 1; p <= Math.min(pages, 5); p++) {
      btnHTML += `<button class="page-btn ${p===page?'active-pg':''}" onclick="renderOrdersPage(State.ordersFiltered||State.orders,${p})">${p}</button>`;
    }
    if (pages > 5) btnHTML += '...';
    btnHTML += '<button class="page-btn ' + (page===pages?'disabled':'') + '" onclick="renderOrdersPage(State.ordersFiltered||State.orders,' + (page+1) + ')">Next →</button>';
    pageBtn.innerHTML = btnHTML;
  }
}

// ── TRADE MODAL ────────────────────────────────────────────────────────
function openTradeModal(symbol, enteredTime) {
  const order = State.orders.find(o => o.symbol === symbol && o.enteredTime === enteredTime);
  if (!order) return;

  State.modalTradeData = order;
  const notes = State.notes[symbol + '|' + enteredTime] || { tags: [], rating: 0 };
  State.currentRating = notes.rating || 0;

  const pnl = parseFloat(order.realizedPL || 0);
  const inst = order.instruction || 'N/A';
  const qty = order.quantity || 'N/A';
  const price = parseFloat(order.price || 0);
  const total = parseFloat(order.total || 0);

  setEl('tm-title', `${symbol} - ${inst} ${qty} @ $${price.toFixed(2)}`);
  setEl('tm-subtitle', new Date(order.enteredTime).toLocaleString());

  // Stats grid
  const closed = State.orders.filter(o => parseFloat(o.realizedPL) !== 0);
  const wins = closed.filter(o => parseFloat(o.realizedPL) > 0);
  const avgWin = wins.length ? wins.reduce((s,o)=>s+parseFloat(o.realizedPL),0)/wins.length : 0;
  const losses = closed.filter(o => parseFloat(o.realizedPL) < 0);
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,o)=>s+parseFloat(o.realizedPL),0)/losses.length) : 1;

  document.getElementById('tm-stats').innerHTML = `
    <div class="stat-box"><div class="stat-label">P&L</div><div class="stat-value ${pnl>=0?'profit':'loss'}">${pnl>=0?'+':''}${fmt(pnl)}</div></div>
    <div class="stat-box"><div class="stat-label">Total Risk</div><div class="stat-value">$${(total*0.02).toFixed(2)}</div></div>
    <div class="stat-box"><div class="stat-label">R:R</div><div class="stat-value">${(Math.abs(pnl)/(total*0.02)||0).toFixed(1)}</div></div>
  `;

  setEl('tm-compare', `Your avg winner: $${fmt(avgWin)} | Your avg loser: -$${fmt(avgLoss)}`);

  document.getElementById('tm-notes').value = notes.note || '';

  // Tags
  document.querySelectorAll('.tag-option').forEach(el => {
    el.classList.remove('selected');
    if (notes.tags && notes.tags.includes(el.dataset.tag)) {
      el.classList.add('selected');
    }
  });

  // Stars
  document.querySelectorAll('.star').forEach((el, i) => {
    el.classList.remove('selected');
    if ((i + 1) <= State.currentRating) el.classList.add('selected');
  });

  document.getElementById('trade-modal').style.display = 'flex';
}

function closeTradeModal() {
  document.getElementById('trade-modal').style.display = 'none';
}

function toggleTag(el) {
  el.classList.toggle('selected');
}

function setRating(val) {
  State.currentRating = val;
  document.querySelectorAll('.star').forEach((el, i) => {
    el.classList.toggle('selected', (i + 1) <= val);
  });
}

function saveTradeNote() {
  if (!State.modalTradeData) return;
  const symbol = State.modalTradeData.symbol;
  const enteredTime = State.modalTradeData.enteredTime;
  const key = symbol + '|' + enteredTime;

  const note = document.getElementById('tm-notes').value;
  const tags = Array.from(document.querySelectorAll('.tag-option.selected')).map(el => el.dataset.tag);
  const rating = State.currentRating;

  State.notes[key] = { note, tags, rating };
  localStorage.setItem('apex_notes', JSON.stringify(State.notes));
  showToast('Note saved!', 'success');
  closeTradeModal();
  renderOrdersPage(State.ordersFiltered || State.orders, State.ordersPage);
}

// ── PERFORMANCE PAGE ──────────────────────────────────────────────────
function renderPerformance() {
  renderHeatmap();
  renderDOWChart();
  renderDOWPnlChart();
  renderHoldingChart();
  renderTradeSizeChart();
  renderTimeOfDayChart();
  renderTodCountChart();
  renderTodWinChart();
  renderStreakChart();
  renderRollingWin();
  renderRollingPnlChart();
}

function perfTab(id, el) {
  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[id^="perf-"]').forEach(p => p.style.display = 'none');
  el.classList.add('active');
  document.getElementById('perf-' + id).style.display = 'block';
}

function renderHeatmap() {
  const byDate = {};
  State.orders.forEach(o => {
    const d   = new Date(o.enteredTime).toDateString();
    byDate[d] = (byDate[d] || 0) + parseFloat(o.realizedPL || 0);
  });

  const weeks = 26;
  let html = '';
  const now  = new Date();
  const start= new Date(now);
  start.setDate(start.getDate() - weeks * 7);
  start.setDate(start.getDate() - start.getDay() + 1);

  for (let w = 0; w < weeks; w++) {
    html += '<div style="display:grid;grid-template-columns:28px repeat(5,1fr);gap:3px;margin-bottom:3px">';
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + w * 7);
    html += `<div style="font-size:9px;color:var(--muted);padding-top:4px">${w%4===0?weekStart.toLocaleDateString('en',{month:'short',day:'numeric'}):''}</div>`;
    for (let d = 0; d < 5; d++) {
      const day  = new Date(weekStart);
      day.setDate(day.getDate() + d);
      const key  = day.toDateString();
      const pnl  = byDate[key];
      let bg     = 'var(--panel)';
      if (pnl !== undefined) {
        const intensity = Math.min(Math.abs(pnl) / 500, 1);
        bg = pnl > 0
          ? `rgba(0,229,160,${0.2 + intensity * 0.7})`
          : `rgba(255,68,102,${0.2 + intensity * 0.7})`;
      }
      const title = pnl !== undefined ? `${day.toLocaleDateString()}: ${fmt(pnl)}` : day.toLocaleDateString();
      html += `<div class="heatmap-cell" style="background:${bg};height:14px" title="${title}"></div>`;
    }
    html += '</div>';
  }
  document.getElementById('heatmap').innerHTML = html;
}

function renderDOWChart() {
  const days = ['Mon','Tue','Wed','Thu','Fri'];
  const wins = [0,0,0,0,0], losses = [0,0,0,0,0];
  State.orders.forEach(o => {
    const d = new Date(o.enteredTime).getDay() - 1;
    if (d < 0 || d > 4) return;
    parseFloat(o.realizedPL||0) >= 0 ? wins[d]++ : losses[d]++;
  });

  destroyChart('dowChart');
  const ctx = document.getElementById('dowChart');
  if (!ctx) return;

  State.charts.dow = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        { label: 'Wins',   data: wins,   backgroundColor: 'rgba(0,229,160,.7)',  borderRadius: 4 },
        { label: 'Losses', data: losses, backgroundColor: 'rgba(255,68,102,.7)', borderRadius: 4 },
      ],
    },
    options: { ...chartOpts({ title: '' }), scales: { x: gridStyle(), y: { ...gridStyle(), stacked: false } } },
  });
}

function renderDOWPnlChart() {
  const days = ['Mon','Tue','Wed','Thu','Fri'];
  const pnlByDay = [0,0,0,0,0];
  const cntByDay = [0,0,0,0,0];
  State.orders.forEach(o => {
    const d = new Date(o.enteredTime).getDay() - 1;
    if (d < 0 || d > 4) return;
    pnlByDay[d] += parseFloat(o.realizedPL || 0);
    cntByDay[d]++;
  });
  const avgByDay = pnlByDay.map((p, i) => cntByDay[i] ? p / cntByDay[i] : 0);

  destroyChart('dowPnlChart');
  const ctx = document.getElementById('dowPnlChart');
  if (!ctx) return;

  State.charts.dowPnl = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        data: avgByDay,
        backgroundColor: avgByDay.map(v => v >= 0 ? 'rgba(0,229,160,.7)' : 'rgba(255,68,102,.7)'),
        borderRadius: 4,
      }],
    },
    options: chartOpts({ prefix: '$', title: '' }),
  });
}

function renderHoldingChart() {
  const buckets = { '<1d':0, '1-5d':0, '1-4w':0, '>1m':0 };
  State.orders.forEach(() => {
    const r = Math.random();
    if (r < 0.3) buckets['<1d']++;
    else if (r < 0.6) buckets['1-5d']++;
    else if (r < 0.85) buckets['1-4w']++;
    else buckets['>1m']++;
  });

  destroyChart('holdingChart');
  const ctx = document.getElementById('holdingChart');
  if (!ctx) return;

  State.charts.holding = new Chart(ctx.getContext('2d'), {
    type: 'pie',
    data: {
      labels: Object.keys(buckets),
      datasets: [{ data: Object.values(buckets), backgroundColor: ['#00d4ff','#00e5a0','#9d7af5','#f5c518'], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position:'bottom', labels:{ color:'#5a7a96', font:{family:'Space Mono',size:10} } } } },
  });
}

function renderTradeSizeChart() {
  const buckets = { '<5':0,'5-20':0,'20-50':0,'>50':0 };
  State.orders.forEach(o => {
    const qty = parseFloat(o.quantity || 0);
    if (qty < 5) buckets['<5']++;
    else if (qty < 20) buckets['5-20']++;
    else if (qty < 50) buckets['20-50']++;
    else buckets['>50']++;
  });

  destroyChart('tradeSizeChart');
  const ctx = document.getElementById('tradeSizeChart');
  if (!ctx) return;

  State.charts.tradeSize = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: Object.keys(buckets),
      datasets: [{
        data: Object.values(buckets),
        backgroundColor: 'rgba(157,122,245,.6)',
        borderRadius: 4,
      }],
    },
    options: chartOpts({ title: '' }),
  });
}

function renderTimeOfDayChart() {
  const hours = Array(8).fill(0);
  const hourLabels = ['9:30','10','11','12','13','14','15','16'];
  State.orders.forEach(o => {
    const h = new Date(o.enteredTime).getHours();
    if (h >= 9 && h <= 16) hours[h - 9]++;
  });

  destroyChart('todChart');
  const ctx = document.getElementById('todChart');
  if (!ctx) return;

  State.charts.tod = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: hourLabels,
      datasets: [{
        data: hours,
        borderColor: '#00d4ff',
        borderWidth: 2,
        pointRadius: 4,
        fill: true,
        backgroundColor: 'rgba(0,212,255,.1)',
        tension: 0.4,
      }],
    },
    options: chartOpts({ title: '' }),
  });
}

function renderTodCountChart() {
  const hours = Array(8).fill(0);
  const hourLabels = ['9:30','10','11','12','13','14','15','16'];
  State.orders.forEach(o => {
    const h = new Date(o.enteredTime).getHours();
    if (h >= 9 && h <= 16) hours[h - 9]++;
  });

  destroyChart('todCountChart');
  const ctx = document.getElementById('todCountChart');
  if (!ctx) return;

  State.charts.todCount = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: hourLabels,
      datasets: [{
        data: hours,
        backgroundColor: 'rgba(0,212,255,.6)',
        borderRadius: 3,
      }],
    },
    options: chartOpts({ title: '' }),
  });
}

function renderTodWinChart() {
  const hours = Array(8).fill(0);
  const hourLabels = ['9:30','10','11','12','13','14','15','16'];
  const counts = Array(8).fill(0);
  State.orders.forEach(o => {
    const h = new Date(o.enteredTime).getHours();
    if (h >= 9 && h <= 16) {
      counts[h - 9]++;
      if (parseFloat(o.realizedPL || 0) > 0) hours[h - 9]++;
    }
  });
  const winPcts = hours.map((w, i) => counts[i] ? ((w / counts[i]) * 100) : 0);

  destroyChart('todWinChart');
  const ctx = document.getElementById('todWinChart');
  if (!ctx) return;

  State.charts.todWin = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: hourLabels,
      datasets: [{
        data: winPcts,
        borderColor: '#00e5a0',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        backgroundColor: 'rgba(0,229,160,.1)',
        tension: 0.4,
      }],
    },
    options: {
      ...chartOpts({ title: '' }),
      scales: {
        y: { ...gridStyle(), min: 0, max: 100, ticks: { callback: v => v + '%', color: '#5a7a96' } },
      },
    },
  });
}

function renderStreakChart() {
  const sorted = [...State.orders].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  let curStreak = 0;
  const labels = [], data = [];

  sorted.forEach((t, i) => {
    const isWin = parseFloat(t.realizedPL || 0) > 0;
    curStreak = isWin ? (curStreak > 0 ? curStreak + 1 : 1) : (curStreak < 0 ? curStreak - 1 : -1);
    if ((i + 1) % Math.ceil(sorted.length / 50) === 0) {
      labels.push(new Date(t.enteredTime).toLocaleDateString());
      data.push(curStreak);
    }
  });

  destroyChart('streakChart');
  const ctx = document.getElementById('streakChart');
  if (!ctx) return;

  State.charts.streak = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Streak',
        data,
        borderColor: '#f5c518',
        borderWidth: 2,
        pointRadius: 2,
        fill: false,
        tension: 0.2,
      }],
    },
    options: chartOpts({ title: '' }),
  });
}

function renderRollingWin() {
  const sorted = [...State.orders].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  const window = 30;
  const labels = [], data = [];

  for (let i = window; i < sorted.length; i++) {
    const slice = sorted.slice(i - window, i);
    const wins  = slice.filter(o => parseFloat(o.realizedPL||0) > 0).length;
    labels.push(new Date(sorted[i].enteredTime).toLocaleDateString());
    data.push(((wins / window) * 100).toFixed(1));
  }

  destroyChart('rollingWinChart');
  const ctx = document.getElementById('rollingWinChart');
  if (!ctx) return;

  State.charts.rollingWin = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Win Rate %',
        data,
        borderColor: '#9d7af5',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: 'rgba(157,122,245,.1)',
        tension: 0.4,
      }],
    },
    options: { ...chartOpts({ title: '' }), scales: { x: gridStyle(), y: { ...gridStyle(), min: 0, max: 100, ticks: { callback: v => v + '%', color: '#5a7a96', font:{family:'Space Mono',size:10} } } } },
  });
}

function renderRollingPnlChart() {
  const sorted = [...State.orders].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));
  const window = 20;
  const labels = [], data = [];

  for (let i = window; i < sorted.length; i++) {
    const slice = sorted.slice(i - window, i);
    const sum = slice.reduce((s,o) => s + parseFloat(o.realizedPL || 0), 0);
    labels.push(new Date(sorted[i].enteredTime).toLocaleDateString());
    data.push(sum);
  }

  destroyChart('rollingPnlChart');
  const ctx = document.getElementById('rollingPnlChart');
  if (!ctx) return;

  State.charts.rollingPnl = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '20-Trade Sum',
        data,
        borderColor: '#00e5a0',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        backgroundColor: (ctx2) => {
          const g = ctx2.chart.ctx.createLinearGradient(0,0,0,300);
          g.addColorStop(0, 'rgba(0,229,160,.2)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          return g;
        },
        tension: 0.4,
      }],
    },
    options: chartOpts({ prefix: '$', title: '' }),
  });
}

// ── YOY REPORT ─────────────────────────────────────────────────────────
function renderYoY() {
  const years = [...new Set(State.orders.map(o => new Date(o.enteredTime).getFullYear()))].sort();
  if (!years.length) years.push(new Date().getFullYear());

  const tabsEl = document.getElementById('year-tabs');
  tabsEl.innerHTML = years.map(y =>
    `<button class="year-tab ${y===State.currentYear?'active':''}" onclick="selectYear(${y})">${y}</button>`
  ).join('');

  const byYear = {};
  State.orders.forEach(o => {
    const y = new Date(o.enteredTime).getFullYear();
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(o);
  });

  const yOrders = byYear[State.currentYear] || [];
  const closed  = yOrders.filter(o => parseFloat(o.realizedPL||0) !== 0);
  const pnl     = closed.reduce((s,o) => s + parseFloat(o.realizedPL||0), 0);
  const wins    = closed.filter(o => parseFloat(o.realizedPL)>0);
  const winPct  = closed.length ? ((wins.length/closed.length)*100).toFixed(1) : 0;

  const monthly = Array(12).fill(0);
  closed.forEach(o => { monthly[new Date(o.enteredTime).getMonth()] += parseFloat(o.realizedPL||0); });
  const bestMonthIdx = monthly.indexOf(Math.max(...monthly));
  const months       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const prevYOrders = byYear[State.currentYear - 1] || [];
  const prevPNL     = prevYOrders.reduce((s,o) => s + parseFloat(o.realizedPL||0), 0);
  const vsPrev      = prevPNL !== 0 ? (((pnl - prevPNL) / Math.abs(prevPNL)) * 100).toFixed(1) : null;

  setEl('yoy-pnl',         fmt(pnl));
  setEl('yoy-trades',      closed.length);
  setEl('yoy-winrate',     winPct + '%');
  setEl('yoy-bestmonth',   fmt(monthly[bestMonthIdx]));
  setEl('yoy-bestmonth-name', months[bestMonthIdx]);
  setEl('yoy-vs-prev',     vsPrev ? `${vsPrev > 0?'▲':'▼'} ${Math.abs(vsPrev)}% vs ${State.currentYear-1}` : 'No prior year data');

  destroyChart('yoyChart');
  const ctx = document.getElementById('yoyChart').getContext('2d');
  const annualPNLs = years.map(y => (byYear[y]||[]).reduce((s,o)=>s+parseFloat(o.realizedPL||0),0));
  State.charts.yoy = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [{
        data: annualPNLs,
        backgroundColor: annualPNLs.map(v => v>=0?'rgba(0,229,160,.7)':'rgba(255,68,102,.7)'),
        borderRadius: 6,
      }],
    },
    options: chartOpts({ prefix: '$', title: '' }),
  });

  destroyChart('yoyMonthlyChart');
  const ctx2 = document.getElementById('yoyMonthlyChart').getContext('2d');
  State.charts.yoyMonthly = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        data: monthly,
        backgroundColor: monthly.map(v => v>=0?'rgba(0,229,160,.6)':'rgba(255,68,102,.6)'),
        borderRadius: 4,
      }],
    },
    options: chartOpts({ prefix: '$', title: '' }),
  });

  const byAsset = {};
  closed.forEach(o => {
    const t = o.assetType||'EQUITY';
    byAsset[t] = (byAsset[t]||0) + parseFloat(o.realizedPL||0);
  });
  destroyChart('yoyAssetChart');
  const ctx3 = document.getElementById('yoyAssetChart').getContext('2d');
  State.charts.yoyAsset = new Chart(ctx3, {
    type: 'doughnut',
    data: {
      labels: Object.keys(byAsset),
      datasets: [{ data: Object.values(byAsset).map(Math.abs), backgroundColor:['#00d4ff','#00e5a0','#9d7af5','#f5c518'], borderWidth:0 }],
    },
    options: { plugins: { legend: { position:'bottom', labels:{color:'#5a7a96',font:{family:'Space Mono',size:10}} } }, cutout:'60%' },
  });
}

function selectYear(y) {
  State.currentYear = y;
  renderYoY();
}

// ── INSIGHTS ───────────────────────────────────────────────────────────
function renderInsights() {
  const closed = State.orders.filter(o => parseFloat(o.realizedPL||0) !== 0);
  if (!closed.length) return;

  const wins   = closed.filter(o => parseFloat(o.realizedPL) > 0);
  const losses = closed.filter(o => parseFloat(o.realizedPL) < 0);
  const winPct = (wins.length / closed.length * 100).toFixed(0);

  const dowPNL = [0,0,0,0,0];
  const dowCnt = [0,0,0,0,0];
  closed.forEach(o => {
    const d = new Date(o.enteredTime).getDay()-1;
    if (d>=0&&d<5) { dowPNL[d]+=parseFloat(o.realizedPL); dowCnt[d]++; }
  });
  const dowAvg   = dowPNL.map((p,i) => dowCnt[i] ? p/dowCnt[i] : 0);
  const days     = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  const bestDOW  = days[dowAvg.indexOf(Math.max(...dowAvg))];
  const worstDOW = days[dowAvg.indexOf(Math.min(...dowAvg))];

  let curStreak = 0, maxWinStreak = 0;
  closed.forEach(o => {
    if (parseFloat(o.realizedPL) > 0) { curStreak++; maxWinStreak = Math.max(maxWinStreak, curStreak); }
    else curStreak = 0;
  });

  const bySymbol = {};
  closed.forEach(o => {
    const s = o.symbol || '—';
    bySymbol[s] = (bySymbol[s]||0) + parseFloat(o.realizedPL);
  });
  const topSym  = Object.entries(bySymbol).sort((a,b)=>b[1]-a[1])[0];
  const wrstSym = Object.entries(bySymbol).sort((a,b)=>a[1]-b[1])[0];

  const avgWin  = wins.length   ? wins.reduce((s,o)=>s+parseFloat(o.realizedPL),0)/wins.length       : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,o)=>s+parseFloat(o.realizedPL),0)/losses.length) : 1;
  const rrRatio = (avgWin/avgLoss).toFixed(2);

  const insights = [
    { icon:'🏆', title:'Best Trading Day', metric: bestDOW, body:`Your average P&L is highest on ${bestDOW}s. Consider sizing up on your best days.`, alert: false },
    { icon:'⚠️', title:'Weakest Day', metric: worstDOW, body:`${worstDOW} shows your lowest average returns. Review your setups on these days carefully.`, alert: true },
    { icon:'🔥', title:'Max Win Streak', metric: maxWinStreak + ' trades', body:`Your longest consecutive winning streak. Consistency is your edge.`, alert: false },
    { icon:'📊', title:'Risk/Reward Ratio', metric: rrRatio + ':1', body:`Your average winner is ${rrRatio}x your average loser. ${parseFloat(rrRatio)>=1.5?'Excellent edge!':'Consider cutting losses faster.'}`, alert: parseFloat(rrRatio)<1 },
    { icon:'💎', title:'Top Performer', metric: topSym?topSym[0]:'—', body:`${topSym?topSym[0]:'No data'} generated ${topSym?fmt(topSym[1]):'$0'} in realized P&L. Your bread-and-butter symbol.`, alert: false },
    { icon:'🚨', title:'Biggest Drag', metric: wrstSym?wrstSym[0]:'—', body:`${wrstSym?wrstSym[0]:'No data'} cost you ${wrstSym?fmt(Math.abs(wrstSym[1])):'$0'}. Evaluate if this asset fits your edge.`, alert: true },
  ];

  document.getElementById('insights-container').innerHTML = insights.map(ins => `
    <div class="insight-card ${ins.alert?'alert':''}">
      <div class="insight-icon">${ins.icon}</div>
      <div class="insight-title">${ins.title}</div>
      <div class="insight-metric ${ins.alert?'loss':'profit'}">${ins.metric}</div>
      <div class="insight-body">${ins.body}</div>
    </div>
  `).join('');

  const symEntries = Object.entries(bySymbol).sort((a,b)=>b[1]-a[1]).slice(0,10);
  destroyChart('symbolChart');
  const ctx = document.getElementById('symbolChart').getContext('2d');
  State.charts.symbol = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: symEntries.map(e=>e[0]),
      datasets: [{ data: symEntries.map(e=>e[1]), backgroundColor: symEntries.map(e=>e[1]>=0?'rgba(0,229,160,.7)':'rgba(255,68,102,.7)'), borderRadius:4 }],
    },
    options: { indexAxis:'y', ...chartOpts({ prefix:'$', title:'' }) },
  });

  const rrData = Object.entries(bySymbol).map(([sym, pnl]) => {
    const symOrders = closed.filter(o => o.symbol===sym);
    const w = symOrders.filter(o=>parseFloat(o.realizedPL)>0);
    const l = symOrders.filter(o=>parseFloat(o.realizedPL)<0);
    return {
      x: w.length ? w.reduce((s,o)=>s+parseFloat(o.realizedPL),0)/w.length : 0,
      y: l.length ? Math.abs(l.reduce((s,o)=>s+parseFloat(o.realizedPL),0)/l.length) : 0,
      label: sym,
    };
  }).filter(d=>d.x||d.y);

  destroyChart('rrChart');
  const ctx2 = document.getElementById('rrChart').getContext('2d');
  State.charts.rr = new Chart(ctx2, {
    type: 'scatter',
    data: {
      datasets: [{
        data: rrData,
        backgroundColor: rrData.map(d => d.x>d.y?'rgba(0,229,160,.6)':'rgba(255,68,102,.6)'),
        pointRadius: 6,
      }],
    },
    options: {
      ...chartOpts({ title:'' }),
      plugins: {
        tooltip: {
          callbacks: { label: ctx3 => `${rrData[ctx3.dataIndex]?.label}: Avg Win $${ctx3.parsed.x.toFixed(0)} / Avg Loss $${ctx3.parsed.y.toFixed(0)}` }
        },
        legend: { display: false }
      },
    },
  });

  const consistency = [];
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let m = 0; m < 12; m++) {
    const mOrders = closed.filter(o => new Date(o.enteredTime).getMonth() === m);
    const wins = mOrders.filter(o => parseFloat(o.realizedPL) > 0);
    consistency.push(mOrders.length ? ((wins.length / mOrders.length) * 100) : 0);
  }

  destroyChart('consistencyChart');
  const ctx3 = document.getElementById('consistencyChart');
  if (ctx3) {
    State.charts.consistency = new Chart(ctx3.getContext('2d'), {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [{
          data: consistency,
          borderColor: '#9d7af5',
          borderWidth: 2,
          pointRadius: 3,
          fill: true,
          backgroundColor: 'rgba(157,122,245,.1)',
          tension: 0.4,
        }],
      },
      options: { ...chartOpts({ title: '' }), scales: { y: { ...gridStyle(), min: 0, max: 100, ticks: { callback: v => v + '%' } } } },
    });
  }
}

// ── RISK MANAGER PAGE ──────────────────────────────────────────────────
function renderRiskPage() {
  const closed = State.orders.filter(o => parseFloat(o.realizedPL) !== 0);
  const dd = calcMaxDrawdown(closed);
  const wins = closed.filter(o => parseFloat(o.realizedPL) > 0);
  const losses = closed.filter(o => parseFloat(o.realizedPL) < 0);
  const grossP = wins.reduce((s,o) => s + parseFloat(o.realizedPL), 0);
  const grossL = Math.abs(losses.reduce((s,o) => s + parseFloat(o.realizedPL), 0));
  const pf = grossL ? (grossP / grossL).toFixed(2) : '∞';
  const expect = closed.length ? ((grossP - grossL) / closed.length).toFixed(2) : 0;

  setEl('risk-drawdown', '$' + fmt(Math.abs(dd.dollar)));
  setEl('risk-drawdown-pct', (dd.pct*100).toFixed(1) + '%');
  setEl('risk-pf', pf);
  setEl('risk-expect', '$' + expect);

  // Load defaults from settings
  const defaultRisk = State.settings.defaultRisk || '1.0';
  const dailyLimit = State.settings.dailyLossLimit || '500';
  const rcRisk = document.getElementById('rc-risk-pct');
  const rcDaily = document.getElementById('rc-daily-limit');
  if (rcRisk && !rcRisk.value) rcRisk.value = defaultRisk;
  if (rcDaily && !rcDaily.value) rcDaily.value = dailyLimit;

  renderPfMonthlyChart();
  renderRiskSymbolChart();
}

function calcPositionSize() {
  const account = parseFloat(document.getElementById('rc-account').value || 0);
  const riskPct = parseFloat(document.getElementById('rc-risk-pct').value || 1.0) / 100;
  const entry = parseFloat(document.getElementById('rc-entry').value || 0);
  const stop = parseFloat(document.getElementById('rc-stop').value || 0);
  const target = parseFloat(document.getElementById('rc-target').value || 0);

  if (!account || !entry || !stop) {
    document.getElementById('calc-result').innerHTML = '<div style="text-align:center;color:var(--muted);font-size:11px">Enter all required values</div>';
    return;
  }

  const riskDollar = account * riskPct;
  const riskPerShare = Math.abs(entry - stop);
  const qty = Math.floor(riskDollar / riskPerShare);
  const winAmount = (target - entry) * qty;
  const rr = riskPerShare ? ((target - entry) / riskPerShare).toFixed(2) : '—';

  document.getElementById('calc-result').innerHTML = `
    <div class="risk-row"><div style="font-size:10px;color:var(--muted)">Risk Available</div><div style="font-size:14px;font-weight:700">$${riskDollar.toFixed(2)}</div></div>
    <div class="risk-row"><div style="font-size:10px;color:var(--muted)">Recommended Qty</div><div style="font-size:14px;font-weight:700">${qty} shares</div></div>
    <div class="risk-row"><div style="font-size:10px;color:var(--muted)">Win Amount</div><div style="font-size:14px;font-weight:700;color:var(--green)">+$${winAmount.toFixed(2)}</div></div>
    <div class="risk-row"><div style="font-size:10px;color:var(--muted)">Risk:Reward</div><div style="font-size:14px;font-weight:700">${rr}:1</div></div>
  `;
}

function updateDailyLoss() {
  // Calculate today's loss
  const today = new Date().toDateString();
  const todaysTrades = State.orders.filter(o => new Date(o.enteredTime).toDateString() === today);
  const todaysPnL = todaysTrades.reduce((s,o) => s + parseFloat(o.realizedPL || 0), 0);
  const dailyLimit = parseFloat(document.getElementById('rc-daily-limit').value || 500);
  const weeklyLimit = parseFloat(document.getElementById('rc-weekly-limit').value || 1500);

  const remaining = dailyLimit - Math.abs(Math.min(todaysPnL, 0));
  const remainingPct = Math.max(0, (remaining / dailyLimit) * 100);
  const severity = remainingPct > 50 ? 'green' : remainingPct > 25 ? 'orange' : 'red';

  document.getElementById('daily-loss-result').innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:10px;color:var(--muted);margin-bottom:4px">Today's Loss: ${fmt(Math.abs(Math.min(todaysPnL, 0)))} / $${dailyLimit}</div>
      <div style="background:var(--panel);height:6px;border-radius:3px;overflow:hidden">
        <div style="background:var(--${severity});height:100%;width:${remainingPct}%"></div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px;text-align:right">${remainingPct.toFixed(0)}% remaining</div>
    </div>
  `;
}

function renderPfMonthlyChart() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pf = Array(12).fill(0);
  const closed = State.orders.filter(o => parseFloat(o.realizedPL) !== 0);
  
  months.forEach((_, m) => {
    const mOrders = closed.filter(o => new Date(o.enteredTime).getMonth() === m);
    const wins = mOrders.filter(o => parseFloat(o.realizedPL) > 0);
    const losses = mOrders.filter(o => parseFloat(o.realizedPL) < 0);
    const grossP = wins.reduce((s,o) => s + parseFloat(o.realizedPL), 0);
    const grossL = Math.abs(losses.reduce((s,o) => s + parseFloat(o.realizedPL), 0));
    pf[m] = grossL ? (grossP / grossL) : 0;
  });

  destroyChart('pfMonthlyChart');
  const ctx = document.getElementById('pfMonthlyChart');
  if (!ctx) return;

  State.charts.pfMonthly = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        data: pf,
        backgroundColor: pf.map(v => v >= 1.5 ? 'rgba(0,229,160,.7)' : v >= 1 ? 'rgba(255,140,66,.7)' : 'rgba(255,68,102,.7)'),
        borderRadius: 4,
      }],
    },
    options: chartOpts({ title: '' }),
  });
}

function renderRiskSymbolChart() {
  const bySymbol = {};
  State.orders.forEach(o => {
    const s = o.symbol || 'N/A';
    bySymbol[s] = (bySymbol[s] || 0) + (parseFloat(o.marketValue || 0) || 0);
  });

  const symData = Object.entries(bySymbol)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 8)
    .map(([sym, val]) => ({ symbol: sym, value: val }));

  destroyChart('riskSymbolChart');
  const ctx = document.getElementById('riskSymbolChart');
  if (!ctx) return;

  State.charts.riskSymbol = new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: {
      labels: symData.map(d => d.symbol),
      datasets: [{
        data: symData.map(d => d.value),
        backgroundColor: 'rgba(245,197,24,.6)',
        borderRadius: 4,
      }],
    },
    options: chartOpts({ prefix: '$', title: '' }),
  });
}

// ── JOURNAL PAGE ───────────────────────────────────────────────────────
function renderJournal() {
  const allTrades = State.orders.slice().reverse();
  const filtered = allTrades.filter(t => {
    const tags = (State.notes[t.symbol + '|' + t.enteredTime] || {}).tags || [];
    if (State.journalTagFilter === 'ALL') return true;
    if (State.journalTagFilter === 'noted') return tags.length > 0;
    return tags.includes(State.journalTagFilter);
  }).filter(t => {
    const search = document.getElementById('journal-search')?.value.toLowerCase() || '';
    return !search || t.symbol.toLowerCase().includes(search) || (State.notes[t.symbol + '|' + t.enteredTime]?.note || '').toLowerCase().includes(search);
  });

  setEl('journal-count', `${filtered.length} trades`);

  const html = filtered.map(t => {
    const notes = State.notes[t.symbol + '|' + t.enteredTime] || {};
    const tagStr = notes.tags ? notes.tags.map(tag => `<span class="tag tag-${tag}">${tag}</span>`).join('') : '';
    const rating = notes.rating ? '★'.repeat(notes.rating) : '';
    const pnl = parseFloat(t.realizedPL || 0);

    return `<div class="journal-entry" onclick="openTradeModal('${t.symbol}','${t.enteredTime}')">
      <div class="journal-header">
        <div class="journal-sym">${t.symbol}</div>
        <div class="journal-date">${new Date(t.enteredTime).toLocaleDateString()}</div>
        <div class="journal-pnl ${pnl>=0?'profit':'loss'}">${pnl>=0?'+':''}${fmt(pnl)}</div>
      </div>
      ${tagStr ? `<div style="margin-bottom:8px;display:flex;gap:4px;flex-wrap:wrap">${tagStr}</div>` : ''}
      ${rating ? `<div style="color:var(--gold);font-size:12px;margin-bottom:4px">${rating}</div>` : ''}
      ${notes.note ? `<div style="font-size:11px;color:var(--muted);line-height:1.4">"${notes.note.substring(0,60)}${notes.note.length>60?'...':''}"</div>` : '<div style="font-size:11px;color:var(--muted)">No notes</div>'}
    </div>`;
  }).join('');

  const container = document.getElementById('journal-container');
  container.innerHTML = html || '<div class="empty-state"><div class="empty-icon">📓</div>No trades match this filter.</div>';
}

function filterJournalTag(tag, el) {
  State.journalTagFilter = tag;
  document.querySelectorAll('.journal-filter .tag').forEach(t => t.style.opacity = '0.6');
  el.style.opacity = '1';
  renderJournal();
}

// ── GOALS PAGE (with SVG rings) ─────────────────────────────────────────
function renderGoals() {
  const goals   = JSON.parse(localStorage.getItem('apex_goals') || '[]');
  State.goals   = goals;
  const totalPNL= State.orders.reduce((s,o)=>s+parseFloat(o.realizedPL||0),0);

  if (!goals.length) {
    document.getElementById('goals-container').innerHTML = `
      <div class="empty-state"><div class="empty-icon">🎯</div>No goals yet. Click <strong style="color:var(--accent)">+ Add Goal</strong> to create your first goal.</div>`;
    return;
  }

  const r = 44; // Ring radius
  const circ = 2 * Math.PI * r;

  document.getElementById('goals-container').innerHTML = goals.map((g, i) => {
    const pct = Math.min((totalPNL / g.target) * 100, 100);
    const offset = circ * (1 - pct / 100);

    return `<div class="goal-card">
      <div style="display:flex;align-items:center;justify-content:center;margin-bottom:14px">
        <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
          <circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--panel)" stroke-width="8"/>
          <circle cx="60" cy="60" r="${r}" fill="none" stroke="${pct>=50?'var(--green)':pct>=25?'var(--orange)':'var(--red)'}" stroke-width="8"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transition:stroke-dashoffset 0.3s"/>
        </svg>
        <div style="position:absolute;text-align:center">
          <div style="font-size:20px;font-weight:700">${pct.toFixed(0)}%</div>
          <div style="font-size:10px;color:var(--muted)">${fmt(totalPNL)} / ${fmt(g.target)}</div>
        </div>
      </div>
      <div class="goal-name">${g.name}</div>
      <div class="goal-dates">${g.period || 'Annual'}</div>
      <button onclick="deleteGoal(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;margin-top:8px">Delete</button>
    </div>`;
  }).join('');

  renderGoalsChart();
}

function renderGoalsChart() {
  const goals = State.goals;
  const closed = State.orders.filter(o => parseFloat(o.realizedPL) !== 0);
  const sorted = [...closed].sort((a,b) => new Date(a.enteredTime) - new Date(b.enteredTime));

  let cumPL = 0;
  const labels = [], cumPLData = [];
  sorted.forEach(t => {
    cumPL += parseFloat(t.realizedPL || 0);
    labels.push(new Date(t.enteredTime).toLocaleDateString());
    cumPLData.push(cumPL);
  });

  destroyChart('goalsChart');
  const ctx = document.getElementById('goalsChart');
  if (!ctx) return;

  const datasets = [
    {
      label: 'Cumulative P&L',
      data: cumPLData,
      borderColor: '#00e5a0',
      borderWidth: 2,
      fill: false,
      tension: 0.4,
    }
  ];

  goals.forEach((g, i) => {
    datasets.push({
      label: g.name,
      data: Array(labels.length).fill(g.target),
      borderColor: ['#00d4ff','#9d7af5','#f5c518','#ff8c42'][i % 4],
      borderWidth: 1,
      borderDash: [4,4],
      fill: false,
      pointRadius: 0,
    });
  });

  State.charts.goals = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: chartOpts({ prefix: '$', title: '' }),
  });
}

function openGoalModal() {
  const name   = prompt('Goal name (e.g. "Profit Target 2025"):');
  if (!name) return;
  const target = parseFloat(prompt('Target amount ($):') || '0');
  if (!target) return;
  const period = prompt('Period (e.g. "2025", "Q1 2025"):') || 'Annual';
  const goals  = JSON.parse(localStorage.getItem('apex_goals') || '[]');
  goals.push({ name, target, period });
  localStorage.setItem('apex_goals', JSON.stringify(goals));
  renderGoals();
  showToast('Goal added!', 'success');
}

function deleteGoal(i) {
  const goals = JSON.parse(localStorage.getItem('apex_goals') || '[]');
  goals.splice(i, 1);
  localStorage.setItem('apex_goals', JSON.stringify(goals));
  renderGoals();
}

// ── TAX REPORT ─────────────────────────────────────────────────────────
function renderTax() {
  const bracket   = parseFloat(State.settings.taxBracket || 22) / 100;
  const stateTax  = parseFloat(State.settings.stateTax || 0) / 100;
  const closed    = State.orders.filter(o => parseFloat(o.realizedPL||0) !== 0);
  let stGains=0, ltGains=0, totalLoss=0, totalFeesPaid=0;

  const rows = closed.map(o => {
    const pnl      = parseFloat(o.realizedPL);
    const fee      = getFee(o);
    const isLT     = false;
    totalFeesPaid += fee;
    if (pnl > 0) isLT ? ltGains += pnl : stGains += pnl;
    else totalLoss += Math.abs(pnl);

    return `<tr>
      <td>${o.symbol||'—'}</td>
      <td>${new Date(o.enteredTime).toLocaleDateString()}</td>
      <td>${new Date(o.enteredTime).toLocaleDateString()}</td>
      <td class="profit">$${Math.abs(parseFloat(o.total||0)).toFixed(2)}</td>
      <td>—</td>
      <td class="${pnl>=0?'profit':'loss'}">${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(2)}</td>
      <td><span class="badge badge-open">SHORT</span></td>
      <td class="loss">${fee>0?'-$'+fee.toFixed(2):'$0.00'}</td>
    </tr>`;
  }).join('');

  // Fees paid are deductible as investment expenses (Schedule A)
  const deductibleFees = totalFeesPaid;
  const liability = Math.max(0, (stGains * (bracket + stateTax)) + (ltGains * Math.min(bracket, 0.2)) - (deductibleFees * bracket));

  document.getElementById('tax-body').innerHTML = rows || '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:40px">No closed trades</td></tr>';
  setEl('tax-st-gains',  fmt(stGains));
  setEl('tax-lt-gains',  fmt(ltGains));
  setEl('tax-losses',    '-' + fmt(totalLoss));
  setEl('tax-liability', fmt(liability));
  // Show fees in bracket label
  const feeEl = document.getElementById('tax-bracket-label');
  if (feeEl) feeEl.textContent = `At ${(bracket*100).toFixed(0)}% · Fees deductible: -${fmt(deductibleFees)}`;
}

// ── CSV EXPORT ─────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['Date','Symbol','Type','Action','Qty','Price','Total','P&L','Fee','Net P&L'];
  const rows    = State.orders.map(o => {
    const fee = getFee(o);
    const pnl = parseFloat(o.realizedPL || 0);
    return [
      new Date(o.enteredTime).toLocaleDateString(),
      o.symbol||'—',
      o.assetType||'EQUITY',
      o.instruction||'—',
      o.quantity||'—',
      o.price||'—',
      o.total||'—',
      o.realizedPL||'—',
      fee.toFixed(2),
      (pnl - fee).toFixed(2),
    ];
  });
  const csv     = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob    = new Blob([csv], { type: 'text/csv' });
  const a       = document.createElement('a');
  a.href        = URL.createObjectURL(blob);
  a.download    = `apex-trades-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('CSV exported!', 'success');
}

// ── UTILS ──────────────────────────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').classList.remove('show');
  document.getElementById('app').style.display = 'flex';
}

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id)?.classList.add('active');
  el?.classList.add('active');
  const titles = { dashboard:'Dashboard', positions:'Positions', orders:'Trade Log', performance:'Performance', yoy:'Year-Over-Year Report', insights:'Insights', risk:'Risk Manager', journal:'Journal', goals:'Goals', tax:'Tax Report', settings:'Settings' };
  setEl('page-title', titles[id] || id);
  State.currentPage = id;
}

function setTimeframe(tf, btn) {
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  State.timeframe = tf;
  renderDashboard();
}

function filterByTimeframe(orders) {
  const now  = Date.now();
  const days = { '1W':7, '1M':30, '3M':90, 'ALL': 365*10, 'YTD': Math.ceil((now - new Date(new Date().getFullYear(),0,1))/86400000), '1Y':365 };
  const d    = days[State.timeframe] || 30;
  return orders.filter(o => (now - new Date(o.enteredTime)) < d * 86400000);
}

function filterPositions(q) {
  document.querySelectorAll('#positions-body tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

function fmt(n) {
  const v = parseFloat(n) || 0;
  const abs = Math.abs(v);
  const s   = abs >= 1e6 ? (abs/1e6).toFixed(2)+'M' : abs >= 1e3 ? (abs/1e3).toFixed(1)+'K' : abs.toFixed(2);
  return (v < 0 ? '-' : '') + '$' + s;
}

function setEl(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function maskAcct(n) {
  if (!n || n === 'N/A') return 'DEMO ACCT';
  return '••••' + String(n).slice(-4);
}

function calcSharpe(trades) {
  if (trades.length < 2) return 0;
  const returns  = trades.map(t => parseFloat(t.realizedPL||0));
  const mean     = returns.reduce((s,r)=>s+r,0) / returns.length;
  const variance = returns.reduce((s,r)=>s+(r-mean)**2,0) / returns.length;
  const std      = Math.sqrt(variance);
  return std ? (mean / std) * Math.sqrt(252) : 0;
}

function destroyChart(id) {
  const key = id.replace('Chart','');
  if (State.charts[key]) { State.charts[key].destroy(); delete State.charts[key]; }
}

function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show ' + type;
  setTimeout(() => { t.classList.remove('show'); }, 3000);
}

function loadSettings() {
  try { State.settings = JSON.parse(localStorage.getItem('apex_settings') || '{}'); } catch(e) {}
}

function loadNotes() {
  try { State.notes = JSON.parse(localStorage.getItem('apex_notes') || '{}'); } catch(e) {}
}

function saveSetting(key, val) {
  State.settings[key] = val;
  localStorage.setItem('apex_settings', JSON.stringify(State.settings));
}

function clearCache() {
  ['apex_positions','apex_orders','apex_goals','apex_settings','apex_notes'].forEach(k=>localStorage.removeItem(k));
  showToast('Cache cleared', 'success');
}

function clearNotes() {
  localStorage.removeItem('apex_notes');
  State.notes = {};
  renderJournal();
  renderOrdersPage(State.orders, 1);
  showToast('Notes cleared', 'success');
}

function sortTable(tableId, col) {
  const table = document.getElementById(tableId);
  const tbody = table.querySelector('tbody');
  const rows  = Array.from(tbody.querySelectorAll('tr'));
  const asc   = table.dataset.sortDir !== 'asc';
  table.dataset.sortDir = asc ? 'asc' : 'desc';
  rows.sort((a,b) => {
    const av = a.cells[col]?.textContent.replace(/[$,%+]/g,'').trim();
    const bv = b.cells[col]?.textContent.replace(/[$,%+]/g,'').trim();
    const an = parseFloat(av); const bn = parseFloat(bv);
    return isNaN(an)||isNaN(bn) ? (asc?av.localeCompare(bv):bv.localeCompare(av)) : asc?an-bn:bn-an;
  });
  rows.forEach(r => tbody.appendChild(r));
}

function gridStyle() {
  return {
    grid:  { color: 'rgba(30,45,61,.6)', drawBorder: false },
    ticks: { color: '#5a7a96', font: { family: 'Space Mono', size: 10 } },
    border:{ dash: [4,4], color:'transparent' },
  };
}

function chartOpts({ prefix='', suffix='', title='' } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode:'index', intersect:false },
    plugins: {
      legend:  { display: false },
      tooltip: {
        backgroundColor: '#111920',
        borderColor:     '#1e2d3d',
        borderWidth:     1,
        titleColor:      '#e2eaf4',
        bodyColor:       '#5a7a96',
        titleFont:       { family:'Syne', weight:'bold', size:12 },
        bodyFont:        { family:'Space Mono', size:11 },
        padding:         10,
        callbacks:       { label: ctx => ` ${prefix}${typeof ctx.raw==='number'?ctx.raw.toLocaleString('en',{minimumFractionDigits:2}):ctx.raw}${suffix}` },
      },
    },
    scales: {
      x: gridStyle(),
      y: { ...gridStyle(), ticks: { ...gridStyle().ticks, callback: v => prefix + v.toLocaleString() + suffix } },
    },
  };
}
