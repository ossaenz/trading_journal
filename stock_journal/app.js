document.addEventListener('DOMContentLoaded', () => {
    // =========== TAB NAVIGATION ===========
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const titles = {
        'dashboard': { title: 'Dashboard', sub: 'Overview of your trading performance' },
        'tickers':   { title: 'Ticker Breakdown', sub: 'Per-ticker P&L, win rates, and trade frequency' },
        'trades':    { title: 'Trades Log', sub: 'Detailed execution history' },
        'data':      { title: 'Data Center', sub: 'Import and manage CSV statements' },
        'ai':        { title: 'AI Analyst', sub: 'Powered by local Ollama instance' }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            tabContents.forEach(t => t.classList.remove('active'));
            const targetId = item.getAttribute('data-tab');
            document.getElementById(`tab-${targetId}`).classList.add('active');
            if (titles[targetId]) {
                pageTitle.textContent = titles[targetId].title;
                pageSubtitle.textContent = titles[targetId].sub;
            }
        });
    });

    // =========== CHART INSTANCES ===========
    let equityChartInstance = null;
    let distChartInstance = null;
    let dailyPnlChartInstance = null;
    let tickerPnlChartInstance = null;

    const chartColors = {
        accent: '#3b82f6',
        pos: '#22c55e',
        neg: '#ef4444',
        warn: '#f59e0b',
        grid: 'rgba(255,255,255,0.04)',
        tooltipBg: 'rgba(12,14,20,0.95)',
    };

    Chart.defaults.color = '#6b7280';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 11;

    // =========== CHART: Equity Curve ===========
    function renderEquityChart(rows) {
        if (!rows || !rows.length) return;
        const ctx = document.getElementById('equityChart');
        if (!ctx) return;
        if (equityChartInstance) equityChartInstance.destroy();

        const sorted = [...rows].filter(r => r.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        let cum = 0;
        const labels = [], data = [];
        sorted.forEach(r => {
            const mult = Number(r.multiplier || 1);
            if (r.side === 'SELL') cum += (r.price * Math.abs(r.qty) * mult) - r.commission;
            else if (r.side === 'BUY') cum -= (r.price * Math.abs(r.qty) * mult) + r.commission;
            else return;
            labels.push(r.date.split('T')[0]);
            data.push(cum);
        });

        const step = Math.max(1, Math.floor(data.length / 120));
        const sL = labels.filter((_, i) => i % step === 0);
        const sD = data.filter((_, i) => i % step === 0);

        equityChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: sL, datasets: [{
                label: 'Equity',
                data: sD,
                borderColor: chartColors.accent,
                backgroundColor: 'rgba(59,130,246,0.08)',
                borderWidth: 2, fill: true, tension: 0.35,
                pointRadius: 0, pointHitRadius: 8
            }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: chartColors.tooltipBg, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
                    y: { grid: { color: chartColors.grid }, ticks: { callback: v => '$' + v.toLocaleString() } }
                }
            }
        });
    }

    // =========== CHART: Distribution Doughnut ===========
    function renderDistChart(metrics) {
        const ctx = document.getElementById('distributionChart');
        if (!ctx) return;
        if (distChartInstance) distChartInstance.destroy();
        if (!metrics.closedTrades) return;

        distChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Wins', 'Losses'], datasets: [{ data: [metrics.winners || 0, metrics.losers || 0], backgroundColor: [chartColors.pos, chartColors.neg], borderWidth: 0, hoverOffset: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { padding: 16 } } } }
        });
    }

    // =========== CHART: Daily P&L Bar ===========
    function renderDailyPnlChart(rows) {
        const ctx = document.getElementById('dailyPnlChart');
        if (!ctx || !rows || !rows.length) return;
        if (dailyPnlChartInstance) dailyPnlChartInstance.destroy();

        // Group by date
        const byDate = {};
        rows.forEach(r => {
            if (!r.date) return;
            const d = r.date.split('T')[0];
            if (!byDate[d]) byDate[d] = 0;
            const mult = Number(r.multiplier || 1);
            if (r.side === 'SELL') byDate[d] += (r.price * Math.abs(r.qty) * mult) - r.commission;
            else if (r.side === 'BUY') byDate[d] -= (r.price * Math.abs(r.qty) * mult) + r.commission;
        });

        const dates = Object.keys(byDate).sort();
        const vals = dates.map(d => Number(byDate[d].toFixed(2)));
        const colors = vals.map(v => v >= 0 ? chartColors.pos : chartColors.neg);

        dailyPnlChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels: dates, datasets: [{ label: 'Daily P&L', data: vals, backgroundColor: colors, borderRadius: 3, barPercentage: 0.7 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: chartColors.tooltipBg } },
                scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
                    y: { grid: { color: chartColors.grid }, ticks: { callback: v => '$' + v.toLocaleString() } }
                }
            }
        });
    }

    // =========== CHART: P&L by Ticker ===========
    function renderTickerPnlChart(tickerStats) {
        const ctx = document.getElementById('tickerPnlChart');
        if (!ctx || !tickerStats || !tickerStats.length) return;
        if (tickerPnlChartInstance) tickerPnlChartInstance.destroy();

        const sorted = [...tickerStats].sort((a, b) => b.netPnl - a.netPnl).slice(0, 20);
        const labels = sorted.map(t => t.ticker);
        const vals = sorted.map(t => t.netPnl);
        const colors = vals.map(v => v >= 0 ? chartColors.pos : chartColors.neg);

        tickerPnlChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Net P&L', data: vals, backgroundColor: colors, borderRadius: 3, barPercentage: 0.65 }] },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: chartColors.tooltipBg } },
                scales: {
                    x: { grid: { color: chartColors.grid }, ticks: { callback: v => '$' + v.toLocaleString() } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    // =========== COMPUTE PER-TICKER STATS ===========
    function computeTickerStats(metrics) {
        if (!metrics || !metrics.positions) return [];
        const stats = [];
        Object.keys(metrics.positions).forEach(ticker => {
            if (!ticker || ticker === 'UNKNOWN' || ticker === '') return;
            const p = metrics.positions[ticker];
            stats.push({
                ticker,
                trades: p.trades || 0,
                realized: p.realized || 0,
                winners: p.winners || 0,
                losers: p.losers || 0,
                winRate: p.trades > 0 ? ((p.winners / p.trades) * 100).toFixed(1) : '0.0',
                avgWin: p.avgWin || 0,
                avgLoss: p.avgLoss || 0,
                biggestWin: p.biggestWin || 0,
                biggestLoss: p.biggestLoss || 0,
                commissions: p.commissions || 0,
                netPnl: Number(((p.realized || 0) - (p.commissions || 0)).toFixed(2))
            });
        });
        return stats.sort((a, b) => b.netPnl - a.netPnl);
    }

    // =========== COMPUTE STREAKS & DRAWDOWN ===========
    function computeAdvanced(metrics, rows) {
        const result = { winStreak: 0, lossStreak: 0, maxDrawdown: 0, projectedAnnual: 0 };
        if (!rows || !rows.length) return result;

        // Streaks from closed trade P&L sequence stored in metrics
        if (metrics._tradeResults && metrics._tradeResults.length) {
            let ws = 0, ls = 0, mws = 0, mls = 0;
            metrics._tradeResults.forEach(pnl => {
                if (pnl > 0) { ws++; ls = 0; mws = Math.max(mws, ws); }
                else if (pnl < 0) { ls++; ws = 0; mls = Math.max(mls, ls); }
            });
            result.winStreak = mws;
            result.lossStreak = mls;
        }

        // Max drawdown from equity curve
        const sorted = [...rows].filter(r => r.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        let cum = 0, peak = 0, maxDD = 0;
        sorted.forEach(r => {
            const mult = Number(r.multiplier || 1);
            if (r.side === 'SELL') cum += (r.price * Math.abs(r.qty) * mult) - r.commission;
            else if (r.side === 'BUY') cum -= (r.price * Math.abs(r.qty) * mult) + r.commission;
            if (cum > peak) peak = cum;
            const dd = peak - cum;
            if (dd > maxDD) maxDD = dd;
        });
        result.maxDrawdown = Number(maxDD.toFixed(2));

        // Projected annualized P&L
        const dates = sorted.filter(r => r.date).map(r => new Date(r.date));
        if (dates.length >= 2) {
            const firstDate = dates[0];
            const lastDate = dates[dates.length - 1];
            const daySpan = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
            const dailyAvg = (metrics.net || 0) / daySpan;
            result.projectedAnnual = Number((dailyAvg * 252).toFixed(2)); // 252 trading days
        }

        return result;
    }

    // =========== RENDER TICKER BREAKDOWN TABLE ===========
    function renderTickerTable(tickerStats) {
        const tbody = document.getElementById('ticker-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        tickerStats.forEach(t => {
            const tr = document.createElement('tr');
            const pnlClass = t.netPnl >= 0 ? 'cell-pos' : 'cell-neg';
            const realClass = t.realized >= 0 ? 'cell-pos' : 'cell-neg';
            tr.innerHTML = `
                <td><strong>${t.ticker}</strong></td>
                <td>${t.trades}</td>
                <td class="${realClass}">$${t.realized.toFixed(2)}</td>
                <td>${t.winRate}%</td>
                <td class="cell-pos">$${t.avgWin.toFixed(2)}</td>
                <td class="cell-neg">-$${Math.abs(t.avgLoss).toFixed(2)}</td>
                <td class="cell-pos">$${t.biggestWin.toFixed(2)}</td>
                <td class="cell-neg">-$${Math.abs(t.biggestLoss).toFixed(2)}</td>
                <td>-$${Math.abs(t.commissions).toFixed(2)}</td>
                <td class="${pnlClass}">$${t.netPnl.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        // Search filter
        const search = document.getElementById('ticker-search');
        if (search) {
            search.oninput = () => {
                const q = search.value.toUpperCase();
                tbody.querySelectorAll('tr').forEach(tr => {
                    const ticker = tr.children[0]?.textContent || '';
                    tr.style.display = ticker.toUpperCase().includes(q) ? '' : 'none';
                });
            };
        }
    }

    // =========== POPULATE DASHBOARD ===========
    function populateDashboard(metrics, rows) {
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.add('hidden');

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const setClass = (id, val, cls) => { const el = document.getElementById(id); if (el) { el.textContent = val; el.className = 'kpi-value ' + cls; } };

        // KPIs
        const netColor = (metrics.net || 0) >= 0 ? 'pos-gradient' : 'text-neg';
        setClass('dash-pnl', `$${(metrics.net || 0).toFixed(2)}`, netColor);
        set('dash-roi', metrics.roiPercent != null ? `ROI: ${metrics.roiPercent}%` : 'ROI: n/a');
        set('dash-winrate', `${metrics.winRate || 0}%`);
        set('dash-wl', `${metrics.winners || 0}W / ${metrics.losers || 0}L`);

        const pf = (metrics.losers > 0 && metrics.avgLoss) ?
            (Math.abs((metrics.avgWin || 0) * (metrics.winners || 0)) / Math.abs((metrics.avgLoss || 0) * (metrics.losers || 0))).toFixed(2)
            : (metrics.winners > 0 ? '∞' : '0.00');
        set('dash-pf', pf);
        set('dash-exp', `$${(metrics.expectancy || 0).toFixed(2)}`);
        set('dash-avgwin', `$${(metrics.avgWin || 0).toFixed(2)}`);
        set('dash-avgloss', `-$${Math.abs(metrics.avgLoss || 0).toFixed(2)}`);

        // Stats bar
        set('dash-trades', metrics.trades || 0);
        set('dash-closed', metrics.closedTrades || 0);
        set('dash-comm', `-$${Math.abs(metrics.commissions || 0).toFixed(2)}`);

        // Advanced calcs
        const adv = computeAdvanced(metrics, rows);
        set('dash-maxdd', `-$${adv.maxDrawdown.toFixed(2)}`);
        set('dash-winstreak', adv.winStreak);
        set('dash-lossstreak', adv.lossStreak);
        const projColor = adv.projectedAnnual >= 0 ? 'text-pos' : 'text-neg';
        const projEl = document.getElementById('dash-projected');
        if (projEl) {
            projEl.textContent = `$${adv.projectedAnnual.toLocaleString()}`;
            projEl.className = 'stat-val ' + projColor;
        }

        // Per-ticker
        const tickerStats = computeTickerStats(metrics);

        // Best / worst performer labels
        if (tickerStats.length) {
            const best = tickerStats[0];
            const worst = tickerStats[tickerStats.length - 1];
            set('dash-best-ticker', `Best: ${best.ticker} (+$${best.netPnl.toFixed(2)})`);
            set('dash-worst-ticker', `Worst: ${worst.ticker} ($${worst.netPnl.toFixed(2)})`);
        }

        // Trades table
        const tbody = document.getElementById('preview-table-wrap-body');
        if (tbody && rows) {
            tbody.innerHTML = '';
            rows.slice(0, 500).forEach(r => {
                const tr = document.createElement('tr');
                const sideColor = r.side === 'BUY' ? 'var(--warn)' : 'var(--pos)';
                const typeLabel = r.isOption ? (r.optionType || 'OPT') : 'Stock';
                const typeColor = r.isOption ? 'var(--accent)' : 'var(--text-dim)';
                tr.innerHTML = `
                    <td>${r.date ? r.date.split('T')[0] : ''}</td>
                    <td><strong>${r.symbol}</strong></td>
                    <td><span style="color:${typeColor};font-size:11px;font-weight:600;">${typeLabel}</span></td>
                    <td><span style="color:${sideColor}">${r.side}</span></td>
                    <td>${r.qty}</td>
                    <td>$${Number(r.price).toFixed(2)}</td>
                    <td>${r.strike ? '$' + r.strike : '—'}</td>
                    <td>${r.expiry || '—'}</td>
                    <td>$${Number(r.commission).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            });

            // Trade search
            const tradeSearch = document.getElementById('trade-search');
            if (tradeSearch) {
                tradeSearch.oninput = () => {
                    const q = tradeSearch.value.toUpperCase();
                    tbody.querySelectorAll('tr').forEach(tr => {
                        const text = tr.textContent.toUpperCase();
                        tr.style.display = text.includes(q) ? '' : 'none';
                    });
                };
            }
        }

        // Charts
        renderEquityChart(rows);
        renderDistChart(metrics);
        renderDailyPnlChart(rows);
        renderTickerPnlChart(tickerStats);
        renderTickerTable(tickerStats);
    }

    // =========== DATA EVENTS ===========
    window.addEventListener('onyxDataUpdated', (e) => {
        const { metrics, rows } = e.detail;
        populateDashboard(metrics, rows);
    });

    // =========== TOAST / BANNER NOTIFICATIONS ===========
    function showToast(msg, color, durationMs) {
        const t = document.createElement('div');
        t.innerHTML = msg;
        t.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);background:' + (color||'#22c55e') + ';color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);text-align:center;max-width:90vw;';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), durationMs || 5000);
    }

    function showResetBanner() {
        const existing = document.getElementById('reset-banner');
        if (existing) return;
        const banner = document.createElement('div');
        banner.id = 'reset-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;z-index:10000;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
        banner.innerHTML = '<span>⚠️ Data looks corrupted (possibly imported twice). Click RESET to wipe and re-import cleanly.</span>' +
            '<button id="hard-reset-btn" style="background:#fff;color:#dc2626;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;margin-left:20px;white-space:nowrap;">RESET ALL DATA</button>';
        document.body.prepend(banner);
        document.getElementById('hard-reset-btn').addEventListener('click', () => {
            if (confirm('This will wipe all stored data so you can re-import cleanly. The original CSV file is NOT deleted. Continue?')) {
                localStorage.clear();
                location.reload();
            }
        });
    }

    // Load from localStorage on init
    try {
        const savedRows = localStorage.getItem('onyx_rows');
        if (!savedRows) throw new Error('no_rows');

        const rows = JSON.parse(savedRows) || [];

        // Auto-detect corrupted/doubled data:
        // If row count is suspiciously high OR metrics show massive negative P&L, show reset banner.
        const savedMetrics = localStorage.getItem('onyx_metrics');
        if (savedMetrics) {
            try {
                const m = JSON.parse(savedMetrics);
                const netPnl = m.net || 0;
                // Corrupted heuristic: net P&L below -$50k is almost certainly doubled data for a retail account
                if (netPnl < -50000 || rows.length > 800) {
                    showResetBanner();
                }
            } catch(e2) {}
        }

        // Recompute metrics fresh from stored rows
        if (window.onyxRecomputeFromStored) {
            window.onyxRecomputeFromStored();
        } else if (savedMetrics) {
            populateDashboard(JSON.parse(savedMetrics), rows);
        }
    } catch (e) {
        if (e.message !== 'no_rows') console.warn('Could not load from localStorage', e);
    }

    // =========== AI ANALYST ===========
    const aiInput = document.getElementById('ai-input');
    const aiSendBtn = document.getElementById('ai-send-btn');
    const chatHistory = document.getElementById('chat-history');

    function appendMessage(sender, text) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${sender === 'user' ? 'chat-user' : 'chat-ai'}`;
        const header = sender === 'user' ? '' : '<strong>TickerOS Analyst</strong><br>';
        div.innerHTML = header + text;
        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return div;
    }

    async function askOllama(promptText) {
        appendMessage('user', promptText);
        aiInput.value = '';
        const aiBubble = appendMessage('ai', '<em>Analyzing data...</em>');

        let contextData = "No data available yet.";
        try {
            const m = localStorage.getItem('onyx_metrics');
            if (m) contextData = JSON.stringify(JSON.parse(m), null, 2);
        } catch (e) {}

        const systemPrompt = `You are a professional, highly analytical AI trading assistant named TickerOS Analyst. Give concise, actionable advice based on the user's trading metrics. Provide insights into win rate, profitability, risk, and per-ticker performance. Here is the user's current performance data:\n${contextData}`;

        try {
            const res = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'llama3', prompt: `${systemPrompt}\n\nUser: ${promptText}\nAssistant:`, stream: false })
            });
            if (!res.ok) throw new Error('Ollama not responding');
            const data = await res.json();
            let fmt = data.response.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            aiBubble.innerHTML = `<strong>TickerOS Analyst</strong><br>${fmt}`;
        } catch (e) {
            aiBubble.innerHTML = `<strong>TickerOS Analyst</strong><br><span style="color:var(--neg)">Engine offline. Ensure Ollama runs on localhost:11434 with 'llama3'. (${e.message})</span>`;
        }
    }

    if (aiSendBtn && aiInput) {
        aiSendBtn.addEventListener('click', () => { if (aiInput.value.trim()) askOllama(aiInput.value.trim()); });
        aiInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && aiInput.value.trim()) askOllama(aiInput.value.trim()); });
    }
});
