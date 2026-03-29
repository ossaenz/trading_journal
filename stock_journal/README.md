# 🥈 TickerOS Trading Dashboard

> A zero-framework, privacy-first, AI-powered trading journal built entirely with **HTML, CSS, and vanilla JavaScript**. Runs on GitHub Pages. All data stays local. Designed to outperform commercial alternatives like TraderSync, Tradervue, and EdgeWonk.

---

## Architecture

- **Zero dependencies** — no React, no Node, no build step. Pure browser JS.
- **GitHub Pages compatible** — static files only, deploy in seconds.
- **Privacy-first** — all data lives in localStorage/IndexedDB on your machine. Nothing is transmitted.
- **AI-powered** — local Ollama integration for trade analysis, pattern detection, and natural-language queries.

---

## Core Trade Tracking

- Stocks, options, ETFs, mutual funds, futures, and crypto.
- Full order lifecycle: filled, partial fill, canceled, rejected, expired, assigned, exercised, expired worthless.
- Long and short positions, including multi-leg option strategies.
- Spreads, straddles, strangles, iron condors, butterflies, wheels, covered calls, cash-secured puts, LEAPS, and complex combos.
- Open/close dates, entry/exit prices, quantity, fees, commissions, and slippage.
- Broker, account, symbol, expiration, strike, contract type, and strategy tags.

## Options-Specific Analytics

- Option chain capture at entry: delta, gamma, theta, vega, rho, IV, IV rank, IV percentile.
- Extrinsic vs intrinsic value tracking.
- Probability of profit, probability of touch, max profit, max loss, breakeven, and ROC.
- Assignment risk, early assignment risk, and exercise event tracking.
- Greeks by leg and net Greeks for spreads and portfolio-level.
- Theta decay by day held.
- DTE, days-to-target, and rolling behavior.
- Mark trades as rolled, adjusted, or defended.

## Performance Analytics

- Realized P&L, unrealized P&L, and total P&L.
- Win rate, loss rate, average win, average loss, profit factor, expectancy.
- Average hold time by strategy and symbol.
- Return on capital, return on risk, return on margin, and annualized return.
- P&L by day, week, month, quarter, and year.
- Equity curve, drawdown, run-up, and recovery time.
- Best/worst trades, best/worst symbols, best/worst strategies.
- Performance by market regime, IV environment, DTE bucket, delta bucket, and time of day.
- Performance before/after earnings, ex-dividend dates, or major events.

## Strategy Analytics

- Results broken out by strategy type.
- Compare wheel vs spreads vs directional vs income strategies.
- Track performance by setup, thesis, and exit reason.
- Measure whether thesis was correct even on losing trades, and vice versa.
- Management action tracking: rolled, hedged, closed early, doubled down, reduced size.
- Trade quality, execution quality, and emotional discipline scoring.
- Journal screenshots, notes, and post-trade review comments.

## Tax Tracking

- Short-term vs long-term gains classification.
- Wash sale detection and wash sale loss carryover.
- Realized gains/losses by tax lot and by account.
- Cost basis: FIFO, LIFO, specific identification, and average cost.
- Options assignment basis adjustments.
- Section 1256 tracking for qualifying contracts.
- Section 475(f) mark-to-market support.
- Qualified covered call handling and holding-period impact.
- Tax lots for partial fills and partial closes.
- Year-end tax summary, realized/unrealized summary, and estimated tax liability.
- Form-ready exports for tax preparers. CSV exports for TurboTax/CPA.
- Capital loss carryforward tracking.
- Adjustments for commissions, fees, assignment fees, and interest expense allocation.

## Income Tracking

- Dividends: declared, ex-date, record date, pay date, qualified vs non-qualified.
- Dividend income by symbol, sector, account, and month.
- DRIP reinvestment tracking.
- Interest income from cash sweeps, treasuries, money market funds, and broker interest.
- Margin interest expense tracking.
- Borrow fees, short stock rebates, and stock loan fees.
- Income vs trading gains reporting.
- Monthly passive income dashboard.

## Margin & Capital Tracking

- Buying power, available margin, excess liquidity, and maintenance requirement.
- Margin utilization over time.
- Interest charged daily and monthly.
- Cash vs margin vs IRA/retirement account handling.
- Reg T and portfolio margin support.
- Buying power reduction per position and after assignment.
- Capital efficiency metrics by trade and by strategy.
- Cash drag tracking and idle cash yield tracking.

## Account & Portfolio Analytics

- Multi-account support.
- Portfolio-level and account-level views.
- Asset allocation by stock, option, cash, bonds, and income instruments.
- Sector, industry, and single-name concentration.
- Exposure by delta, notional value, and buying power used.
- Correlation analysis between positions.
- Risk concentration warnings for oversized positions.
- Portfolio heatmap by symbol, sector, and strategy.

## Market & Context Data

- Market price snapshots at entry, exit, and daily marks.
- Historical price charts for each trade.
- Earnings dates, dividends, splits, stock dividends, mergers, and corporate actions.
- VIX, SPX/QQQ/sector benchmark comparison.
- Economic calendar overlays for event impact study.
- IV rank and percentiles over time.
- Benchmarking against SPY, QQQ, or custom benchmark.

## Journaling & Workflow

- Pre-trade plan, thesis, target entry, target exit, and invalidation level.
- Post-trade review with lessons learned.
- Emotional state, confidence score, and rule adherence.
- Trade checklist and setup rating.
- Tags: earnings, oversold, trend, mean reversion, income, hedge, etc.
- Attach notes, screenshots, and chart annotations.
- Searchable trade journal with filters and saved views.

## Reporting

- Daily, weekly, monthly, quarterly, and annual reports.
- Strategy, symbol, broker/account, tax, income, risk, execution, and win/loss reports.
- Best/worst setup reports.
- Custom report builder with date range, tags, strategies, and metrics.
- Export to PDF, CSV, Excel, and API.

## Risk Management

- Position sizing rules.
- Max risk per trade and per symbol.
- Portfolio drawdown limits.
- Stop-loss and profit-target tracking.
- Alerting when risk rules are broken.
- Stress testing and scenario analysis.
- What-if analysis for price moves, IV changes, and assignment.
- Delta-neutral and beta-adjusted exposure calculations.
- Tail-risk monitoring.

## Execution Quality

- Fill quality vs mid-price and spread.
- Slippage tracking.
- Commission and fee impact.
- Time-to-fill and partial fill tracking.
- Limit vs market vs stop order performance.
- Broker comparison for multi-platform users.

## Advanced Analytics

- Cohort analysis by month or strategy.
- Trade sequence analysis.
- Rolling 30-day and 90-day performance.
- Seasonality by day of week, month, and hour.
- Heatmaps and trend decomposition.
- Monte Carlo simulations on trade returns.
- Expectancy by setup and market condition.
- Regression and factor analysis against market indicators.
- Probability distributions of returns and drawdowns.

## Data Management

- Manual trade entry and edits.
- Duplicate detection and reconciliation.
- Audit log for every change.
- Backup and restore.
- Data versioning.
- Multi-device sync.
- CSV/JSON import and export.
- Attachments for statements and screenshots.
- Data integrity checks.

## Dashboards

| Dashboard | Purpose |
|---|---|
| Equity Curve | Cumulative P&L, drawdown overlay, recovery periods |
| P&L by Strategy | Head-to-head strategy comparison |
| Tax | ST/LT gains, wash sales, estimated liability |
| Income | Dividends, interest, passive income trends |
| Margin | Utilization, interest, buying power over time |
| Options Greeks | Delta/gamma/theta/vega exposure |
| Trade Review | Per-trade journal, notes, screenshots |
| Risk | Concentration, drawdown limits, position sizing |
| Calendar | Expirations, earnings, ex-div dates |
| Broker Reconciliation | Multi-account, multi-broker sync |

## AI Features (Local Ollama)

- Natural-language queries: *"show my worst SPY put trades in 2026"*
- AI-generated trade summaries and post-trade insights.
- Pattern detection across trade history.
- Strategy recommendations based on historical edge.
- Tax optimization suggestions.

---

## Quick Start

```bash
# Clone
git clone https://github.com/YOUR_USER/stock_journal.git
cd stock_journal

# Serve locally
python3 -m http.server 8080
# Open http://localhost:8080

# For AI features, ensure Ollama is running:
ollama serve
ollama pull llama3
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Charts | Chart.js (CDN) |
| CSV Parsing | PapaParse (CDN) |
| Typography | Inter (Google Fonts) |
| Storage | localStorage + IndexedDB |
| AI | Local Ollama API (localhost:11434) |
| Hosting | GitHub Pages |

---

**License:** MIT
