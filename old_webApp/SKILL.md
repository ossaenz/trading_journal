# SKILL.md — QuantumWheel Trading Dashboard
## AI Continuation Guide

> **Purpose**: This file gives any AI LLM the complete context needed to continue development on this project without prior conversation history. Read this FIRST before touching any code.

---

## 1. Project Identity

- **App name**: QuantumWheel Trading Dashboard
- **Version**: 1.0 (March 2026)
- **Deployment**: GitHub Pages (static, no server)
- **Entry point**: `index.html` — single-file app, **all HTML + CSS + JS lives here**
- **Line count**: 1,236 lines
- **File size**: ~53 KB uncompressed

---

## 2. Tech Stack (Exact CDN Versions)

All dependencies are loaded via CDN **in the `<head>`** of `index.html`. Do not install npm packages.

| Library | CDN URL | Purpose |
|---------|---------|---------|
| Tailwind CSS | `https://cdn.tailwindcss.com` | Utility classes (used minimally, most CSS is inline) |
| Chart.js 4.4.0 | `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js` | All charts |
| Google API | `https://apis.google.com/js/api.js` | Google Drive OAuth + Drive API v3 |
| CryptoJS 4.2.0 | `https://cdn.jsdelivr.net/npm/crypto-js@4.2.0/crypto-js.min.js` | AES-256 backup encryption |
| jsPDF 2.5.1 | `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` | PDF report generation |
| SheetJS 0.18.5 | `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` | Excel export |
| Font Awesome 6.4 | `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css` | Tab/button icons |
| Inter Font | Google Fonts (`@import` in CSS) | Typography |

---

## 3. File Structure

```
trading_journal/
├── index.html               ← ENTIRE APP (edit this file for all features)
├── Code.gs                  ← DEPRECATED — do not use (legacy Google Apps Script stub)
├── journal_data.json        ← Sample/placeholder data (not loaded by app)
├── storage.json             ← Sample/placeholder (not loaded by app)
├── README.md                ← Feature overview
├── SETUP_GUIDE.md           ← Step-by-step OAuth setup
├── API_REFERENCE.md         ← Schwab + Google Drive endpoint docs
├── ARCHITECTURE.md          ← System diagrams
├── IMPLEMENTATION_SUMMARY.md← Build session notes
├── REQUIREMENTS_CHECKLIST.md← Feature audit
├── PROJECT_COMPLETION.md    ← Delivery report
└── SKILL.md                 ← THIS FILE
```

**Only `index.html` contains runnable code.** All other `.md` files are documentation. `Code.gs` is dead code.

---

## 4. CSS Architecture

### CSS Variables (lines 21–28 in `index.html`)
```css
:root {
    --bg: #0a0a0a;        /* Page background */
    --card: #1e1e1e;      /* Card/panel background */
    --accent: #00d4aa;    /* Teal — primary interactive color */
    --profit: #10b981;    /* Green — positive P&L */
    --loss: #ef4444;      /* Red — negative P&L */
    --border: rgba(255,255,255,0.08);  /* Subtle dividers */
}
```

### Key CSS Classes
| Class | Usage |
|-------|-------|
| `.glass` | Semi-transparent card with blur (glassmorphism) |
| `.glass-dark` | Solid dark card (`var(--card)`) |
| `.btn-primary` | Teal filled button |
| `.btn-secondary` | Ghost button (dark, border) |
| `.page` | Tab content panel — hidden by default |
| `.page.active` | Visible tab — toggled by `showPage()` |
| `.nav-btn` | Sidebar navigation button |
| `.nav-btn.active` | Highlighted nav item |
| `.tag` | Trade category badge |
| `.tag-swing` | Blue badge |
| `.tag-options` | Purple badge |
| `.tag-dividend` | Green badge |
| `.tag-loss` | Red badge |
| `.profit` | Green text color |
| `.loss` | Red text color |

### Responsive Breakpoint
- `@media (max-width: 768px)`: Sidebar hidden, charts shrink to 250px. Toggle via hamburger `#menu-btn`.

---

## 5. HTML Layout Structure

```
<body>
  <!-- Setup Modal (shown on first load if no localStorage creds) -->
  <div id="setup-modal" class="modal active">
    Inputs: #google-client-id, #schwab-client-id
    Button: onclick="saveSetup()"

  <!-- Main App Layout -->
  <div style="display:flex">

    <!-- Sidebar Navigation -->
    <div class="sidebar">
      Nav buttons: onclick="showPage('dashboard'|'history'|'goals'|'reports'|'backups'|'settings')"

    <!-- Main Content -->
    <main>
      <!-- Topbar: #menu-btn (mobile), Sync button (syncData()), Auth button -->

      <!-- 6 Tab Pages (only one .active at a time) -->
      <div id="page-dashboard" class="page active">   ← Default visible tab
      <div id="page-history" class="page">
      <div id="page-goals" class="page">
      <div id="page-reports" class="page">
      <div id="page-backups" class="page">
      <div id="page-settings" class="page">

      <footer>
        Last synced: <span id="last-sync">
```

---

## 6. JavaScript Architecture

All JS is in a single `<script>` block at the bottom of `index.html` (starting ~line 695). There are no modules, no bundler.

### Global State
```javascript
const CONFIG = {
    googleClientId: localStorage.getItem('google_client_id') || '',
    schwabClientId: localStorage.getItem('schwab_client_id') || '',
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    schwabScopes: 'PlaceTrades,AccountAccessRead'
};

let tradeData = {
    trades: [],      // Array of trade objects (see schema below)
    goals: {},       // User goal values
    lastSync: null   // ISO timestamp
};

let db;              // IndexedDB instance (set by initDB())
let chartInstances = {};  // Keyed by 'equity', 'allocation', 'goals'
```

### Function Index (by section)

| Section Comment | Functions |
|----------------|-----------|
| `CONFIG & STATE` | — (globals only) |
| `UI FUNCTIONS` | `saveSetup()`, `showPage(pageName)`, `toggleSidebar()` |
| `DATA SYNC & API` | `syncData()`, `fetchSchwabData()`, `loadFromDrive()` |
| `AUTHENTICATION` | `openAuthModal()`, `initDriveAuth()` |
| `DATA EXPORT & IMPORT` | `exportCSV()`, `backupLocal()`, `backupExcel()`, `importBackup()` |
| `PDF GENERATION` | `generatePDFReport()`, `generateTaxReport()`, `generateAnalytics()` |
| `DRIVE SYNC` | `syncDrive()` |
| `CHARTS` | `initCharts()`, `initGoalsChart()` |
| `UTILITIES` | `showNotification(message, type)`, `saveGoals()`, `updateSettings()`, `saveSettings()`, `clearAllData()` |
| `INITIALIZATION` | `DOMContentLoaded` listener, `initDB()` |

---

## 7. Trade Object Schema

When building out data features, trades should conform to this shape:

```javascript
{
    id: 'uuid-string',            // Unique identifier
    date: '2026-03-24',           // ISO date string
    symbol: 'AAPL',               // Ticker symbol
    side: 'BUY' | 'SELL',        // Order side
    quantity: 100,                // Number of shares/contracts
    entryPrice: 150.00,           // Entry price per unit
    exitPrice: 158.50,            // Exit price per unit
    pnl: 850.00,                  // Realized P&L in dollars
    roi: 0.0567,                  // Return on investment (decimal)
    holdDays: 3,                  // Number of days held
    assetType: 'EQUITY' | 'OPTION', // Asset class
    type: 'TRADE' | 'DIVIDEND',   // Transaction type
    category: 'swing' | 'options' | 'dividend' | 'loss' | 'day-trade',
    tags: [],                     // User-defined string tags
    notes: ''                     // Free text notes
}
```

### Trade Categorization Logic
```javascript
function categorizeTrade(trade) {
    if (trade.assetType === 'OPTION') return 'options';
    if (trade.type === 'DIVIDEND') return 'dividend';
    if (trade.pnl < 0) return 'loss';
    if (trade.assetType === 'EQUITY' && trade.holdDays > 1) return 'swing';
    return 'day-trade';
}
```

---

## 8. localStorage Keys

| Key | Value | Set by |
|-----|-------|--------|
| `google_client_id` | Google OAuth Client ID string | `saveSetup()`, `updateSettings()` |
| `schwab_client_id` | Schwab OAuth Client ID string | `saveSetup()`, `updateSettings()` |
| `schwab_token` | Schwab Bearer token (OAuth result) | Schwab OAuth callback (not yet wired) |
| `quantum_trades` | JSON stringified `tradeData` object | `importBackup()` |
| `quantum_goals` | JSON stringified goals object | `saveGoals()` |

---

## 9. IndexedDB Structure

Database name: `QuantumWheel`, version: `1`

| Store Name | Key Path | Purpose |
|------------|----------|---------|
| `trades` | `id` | Persistent trade history (offline cache) |
| `backups` | `timestamp` | Backup metadata records |

The `db` variable is initialized via `initDB()` which is called in `DOMContentLoaded`.

---

## 10. Chart.js Instances

Charts are stored in `chartInstances` to prevent re-initialization:

| Key | Canvas ID | Type | Tab | Data State |
|-----|-----------|------|-----|------------|
| `equity` | `chart-equity` | `line` | Dashboard | **HARDCODED mock data** |
| `allocation` | `chart-allocation` | `doughnut` | Dashboard | **HARDCODED mock data** |
| `goals` | `chart-goals` | `bar` | Goals | **HARDCODED mock data** |

> **Important**: All chart data is currently static/hardcoded. Real data from `tradeData.trades` is not yet wired to charts.

Charts are initialized **lazily** — only when their tab page is shown:
- `showPage('dashboard')` → calls `initCharts()` after 100ms
- `showPage('goals')` → calls `initGoalsChart()` after 100ms

---

## 11. API Integration Status

### Charles Schwab Trader API
- **Base URL**: `https://api.schwabapi.com/trader/v1/`
- **Auth**: OAuth 2.0 (client-side popup flow)
- **Token storage**: `localStorage.getItem('schwab_token')`
- **Status**: `fetchSchwabData()` exists but **OAuth popup to get the token is not implemented**
- **What's missing**: The Schwab OAuth popup that redirects to `https://api.schwab.com/v1/oauth/authorize` and handles the callback to extract + store the bearer token

### Google Drive API v3
- **Auth**: `gapi.client` popup via `initDriveAuth()`
- **Scope**: `https://www.googleapis.com/auth/drive.file`
- **Status**: `loadFromDrive()` and `syncDrive()` exist but **gapi.client.init() uses placeholder `'YOUR_API_KEY'`** — needs real API key or migration to newer `google.accounts.oauth2` flow (gapi.auth2 is deprecated)
- **What's missing**: Replace `gapi.auth2` with `google.accounts.oauth2` (GIS library) for modern OAuth 2.0 token-based flow

---

## 12. Known Gaps & TODOs

These are **incomplete features** that exist in the UI but have placeholder/mock implementations:

### High Priority
- [ ] **Schwab OAuth flow**: Add popup window that opens `https://api.schwab.com/v1/oauth/authorize?response_type=code&client_id=...&redirect_uri=...`, captures auth code via `postMessage`, exchanges for bearer token
- [ ] **Google Drive real auth**: Replace deprecated `gapi.auth2` with `google.accounts.oauth2` (Google Identity Services). Load `https://accounts.google.com/gsi/client` in head
- [ ] **Wire charts to real data**: `initCharts()` and `initGoalsChart()` use hardcoded arrays. Replace with computed values from `tradeData.trades`
- [ ] **Trade table population**: History tab table (`#trades-tbody`) is static HTML — needs JS to render from `tradeData.trades`
- [ ] **Drive sync completion**: `syncDrive()` builds the encrypted blob but never actually POSTs it to Drive API — the fetch call to `https://www.googleapis.com/upload/drive/v3/files` is missing
- [ ] **Stats cards**: Dashboard hero stat numbers (P&L, Win Rate, Avg Hold, Sharpe) are hardcoded strings — need JS to calculate from `tradeData.trades`

### Medium Priority  
- [ ] **PDF report real data**: `generatePDFReport()` has hardcoded strings instead of pulling from `tradeData`
- [ ] **Goals persistence on load**: Goals inputs (`#goal-return`, `#goal-winrate`, `#goal-monthly`) don't restore saved values from `localStorage.getItem('quantum_goals')` on page load
- [ ] **Search/filter in History tab**: The search input exists in HTML but has no `oninput` handler wired up
- [ ] **Backup history table**: `#backup-history` has one static row — not dynamically populated
- [ ] **Settings pre-fill**: Settings tab inputs don't auto-populate with current `CONFIG` values on page show

### Low Priority
- [ ] **Heatmap chart**: Strategy performance heatmap (mentioned in requirements but using bar chart instead)
- [ ] **Virtual scrolling**: For 1000+ trade history rows
- [ ] **PWA Service Worker**: For true offline mode
- [ ] **Kelly Criterion UI**: Math exists in `generateAnalytics()` but no dedicated input UI

---

## 13. How to Add a New Feature

### Adding a new tab
1. Add nav button in sidebar: `<button class="nav-btn" onclick="showPage('newtab')">...</button>`
2. Add page div: `<div id="page-newtab" class="page">...</div>`
3. If tab needs a chart, add canvas inside page, then call `initNewTabChart()` from inside `showPage()` when `pageName === 'newtab'`

### Adding a new JS function
Add it inside the `<script>` block, grouped under a `// === SECTION NAME ===` comment header for readability.

### Adding a new CDN library
Add `<script src="...">` in the `<head>` before the closing `</head>` tag, after existing CDN imports.

### Modifying the color scheme
Edit the `:root` CSS variables block (lines 21–28). Every color reference in the app uses `var(--accent)`, `var(--loss)`, etc.

---

## 14. Patterns to Follow

### Showing a toast notification
```javascript
showNotification('✓ Action completed', 'success');  // green
showNotification('✗ Something failed', 'error');     // red
showNotification('Info message', 'info');             // blue
```

### Async API call pattern
```javascript
async function fetchSomething() {
    const token = localStorage.getItem('some_token');
    if (!token) return;
    try {
        const data = await fetch('https://api.example.com/endpoint', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());
        // handle data
    } catch (err) {
        console.error('Error:', err);
        showNotification('✗ Request failed', 'error');
    }
}
```

### Chart update pattern (updating existing chart data)
```javascript
chartInstances.equity.data.labels = newLabels;
chartInstances.equity.data.datasets[0].data = newData;
chartInstances.equity.update();
```

### Writing to IndexedDB
```javascript
const tx = db.transaction('trades', 'readwrite');
const store = tx.objectStore('trades');
store.put(tradeObject);  // tradeObject must have 'id' key
```

### Reading all trades from IndexedDB
```javascript
const tx = db.transaction('trades', 'readonly');
const store = tx.objectStore('trades');
const request = store.getAll();
request.onsuccess = (e) => {
    const trades = e.target.result;
    // use trades array
};
```

---

## 15. Deployment Notes

- **Host**: GitHub Pages (static, no Node/Python server needed)
- **URL pattern**: `https://<username>.github.io/trading_journal/`
- **No build step**: Edit `index.html`, push to `main` branch, GitHub Pages serves it instantly
- **CORS**: Schwab API requires the exact redirect URI (`https://<username>.github.io/trading_journal/callback`) registered in Schwab Developer Portal
- **Google OAuth**: Authorized JavaScript origin must be `https://<username>.github.io` in Google Cloud Console

---

## 16. What Is Mock/Hardcoded vs Real

| Feature | Status |
|---------|--------|
| Dashboard stat cards (`$12,500`, `68.4%` etc) | **MOCK** — hardcoded HTML strings |
| Equity curve chart data | **MOCK** — hardcoded monthly array |
| Allocation pie chart data | **MOCK** — hardcoded percentages |
| Goals bar chart data | **MOCK** — hardcoded year data |
| Trade History table rows | **MOCK** — static HTML rows |
| Backup history table | **MOCK** — one static row |
| Reports (PDF/Tax metrics) | **MOCK** — hardcoded strings |
| Schwab API fetch (`fetchSchwabData`) | **REAL** fetch call, but no token flow yet |
| Google Drive list files (`loadFromDrive`) | **REAL** gapi call, but auth not complete |
| localStorage read/write | **REAL** and working |
| IndexedDB setup (`initDB`) | **REAL** and working |
| CSV export | **REAL** (iterates `tradeData.trades`, currently empty) |
| Excel export | **REAL** (uses SheetJS, works on `tradeData.trades`) |
| JSON backup | **REAL** (exports `tradeData` object) |
| Import backup | **REAL** (parses uploaded JSON) |
| Goals save/load | **REAL** (localStorage persisted) |
| Settings save | **REAL** (CONFIG + localStorage) |
| Clear all data | **REAL** (wipes localStorage + IndexedDB) |

---

## 17. Quick Reference: Starting Points for Common Tasks

| Task | Where to look | Function to modify |
|------|--------------|-------------------|
| Fix Schwab OAuth login | JS `AUTHENTICATION` section | Add OAuth popup before `fetchSchwabData()` |
| Fix Google Drive auth | JS `AUTHENTICATION` section | Replace `initDriveAuth()` with GIS token client |
| Show real trade data in table | History tab HTML + JS | Write `renderTradesTable(trades)` function |
| Update dashboard stats | Dashboard tab HTML | Write `updateStatCards()` replacing hardcoded text |
| Connect chart to real data | `initCharts()` function | Replace hardcoded arrays with computed from `tradeData.trades` |
| Add new trade manually | Settings or History tab | Write `addManualTrade(tradeObj)` that pushes to `tradeData.trades` + IndexedDB |
| Complete Drive sync | `syncDrive()` function | Add `fetch('https://www.googleapis.com/upload/drive/v3/files', {...})` |
| Style a new component | Inline style or CSS block | Follow patterns: use `var(--accent)`, `var(--card)`, `var(--border)` |

---

## 18. Conversation History Summary

This app was built in a single session (~March 24, 2026). The original repo had a partial implementation with a Google Apps Script backend (`Code.gs`) and a basic UI. The entire `index.html` was rebuilt from scratch as a client-side single-file app. `Code.gs` was deprecated (now just a comment). Six documentation files were written. The app has a complete, polished UI but several features are wired to mock/placeholder data — the main outstanding work is connecting the real API flows (Schwab OAuth, Google Drive GIS auth) and replacing hardcoded dashboard values with computed results from `tradeData.trades`.
