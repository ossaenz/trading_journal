# QuantumWheel Setup Guide

Complete step-by-step instructions to get your trading dashboard running.

## Prerequisites
- GitHub account (for Pages deployment)
- Google account (for Drive backups)
- Charles Schwab brokerage account
- Modern web browser (Chrome, Firefox, Safari, Edge)

---

## Step 1: Deploy to GitHub Pages

### Via GitHub Web UI
1. Navigate to your repo: `https://github.com/yourusername/practice`
2. Go to **Settings** → **Pages** (left sidebar)
3. Under "Build and deployment":
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `docs` folder
   - **Save**
4. Wait 2-3 minutes for GitHub to deploy
5. Visit: `https://yourusername.github.io/trading_journal/`

### Via Command Line
```bash
cd /path/to/trading_journal
# Copy index.html to docs folder
cp index.html ../docs/

# Commit & push
git add .
git commit -m "Deploy QuantumWheel to GitHub Pages"
git push origin main
```

---

## Step 2: Google Cloud Setup

### Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **Select a Project** → **NEW PROJECT**
3. Name: `QuantumWheel` → Create
4. Wait for project to initialize

### Enable Google Drive API
1. In Cloud Console, click **"Enable APIs and Services"**
2. Search: `Google Drive API`
3. Click result → **ENABLE**
4. Wait for confirmation

### Create OAuth 2.0 Credentials
1. Go to **Credentials** (left menu)
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure OAuth consent screen:
   - **User Type**: External
   - **App name**: QuantumWheel
   - **User support email**: your-email@example.com
   - **Developer contact**: your-email@example.com
   - Save & continue
4. Back to credentials, click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. **Application type**: Web application
6. **Name**: `QuantumWheel Trading Dashboard`
7. Under **Authorized redirect URIs**, add:
   ```
   https://yourusername.github.io/trading_journal/
   https://yourusername.github.io/trading_journal/callback
   ```
8. Click **CREATE**
9. Copy **Client ID** (looks like: `xxx-yyy.apps.googleusercontent.com`)

---

## Step 3: Schwab Developer Portal Setup

### Register Application
1. Go to [developer.schwab.com](https://developer.schwab.com)
2. Log in with your Schwab account (create if needed)
3. Go to **My Apps** → **Create New App**
4. **App Name**: `QuantumWheel Trading`
5. **App Type**: `Web`
6. **Description**: `Personal trading journal with API integration`
7. Click **Create**

### Get Client ID
1. In My Apps, click your app
2. Copy **Client ID** 
3. Note: You'll see "Key" and "Secret" — for client-side, we use **Client ID** only

### Configure Redirect URIs
1. In your app settings, go to **OAuth Redirect URL**
2. Add:
   ```
   https://yourusername.github.io/trading_journal/
   https://yourusername.github.io/trading_journal/callback
   ```
3. Save

### Request Trader API Access
1. Go to **Market Data** tab
2. Check: **Trader API** (for orders, balances, positions)
3. Submit request (may take 1-2 days for approval)

---

## Step 4: Launch QuantumWheel

### First Time Setup
1. Open: `https://yourusername.github.io/trading_journal/`
2. Modal appears: "Initial Setup Required"
3. Enter credentials:
   - **Google Client ID**: Paste from Step 2
   - **Schwab Client ID**: Paste from Step 3
4. Click **"Start Dashboard"**
5. App stores credentials in browser `localStorage` (never uploaded anywhere)

### Authenticate with Google Drive
1. Go to **Backups & Drive** tab
2. Click **"Start Drive Sync"**
3. Browser popup: Approve access to Google Drive
4. App creates `QuantumWheel` folder in your Drive
5. Data synced automatically

### Authenticate with Schwab
1. Go to **Settings** tab
2. (Optional) Update Schwab Client ID
3. Click **"Sync"** button in header
4. Browser popup: Schwab OAuth login
5. This fetches your accounts, positions, orders

---

## Step 5: Configure Trading Preferences

### Import Trade Data
1. **Trade History** tab
2. Click **"Import Backup"**
3. Select CSV or JSON file (if coming from another service)
4. Data loads and updates tracker

### Set Yearly Goals
1. **Goals** tab
2. Update targets:
   - Target Return: `15%` (default)
   - Win Rate: `65%` (default)
   - Monthly Consistency: `1%` (default)
3. Click **"Save Goals"**

### Auto-Refresh Settings
1. **Settings** tab → **Preferences**
2. Toggle options:
   - ✅ Auto-refresh every 30s (syncs from Schwab)
   - ✅ Enable notifications
   - ✅ Encrypt Drive backups
3. Click **"Save All Settings"**

---

## Step 6: First Data Sync

### Sync from Schwab
1. Click **Sync** button (top right)
2. Loading spinner appears
3. App fetches:
   - Account balances
   - Recent positions
   - Trade history
4. Charts update automatically
5. Status: "Last synced: [time]"

### Create Backup
1. Go to **Backups & Drive** tab
2. Click **"Backup to JSON"** (local download)
3. Or **"Start Drive Sync"** (encrypted to Google Drive)
4. File saved: `trades_backup_2025-03-24.json`

---

## Troubleshooting

### "Setup modal stays open"
- Check console (F12 → Console tab)
- Verify Client IDs are pasted correctly
- IDs should have spaces/formatting intact

### "Schwab sync fails"
- Confirm app request approved (check email from Schwab)
- Try again in 30 min if rate-limited
- Use localhost testing first if available

### "Google Drive sync not working"
- Go to Settings → update Google Client ID
- Re-authorize: Backups & Drive tab → Start Drive Sync
- Check console for 403 errors (permissions issue)

### "Charts not rendering"
- Ensure browser allows JavaScript
- Check ad blocker (disable for domain)
- Try incognito mode to rule out extensions

### "Data lost after browser clear"
- ✅ Solution: Enable Drive sync for backups
- Without Drive, data is lost if localStorage cleared
- Always export before clearing browser data

---

## API Limits & Rate Limiting

### Schwab API
- **Requests/minute**: 120 (production)
- **Daily limit**: Varies by endpoint
- App retries with exponential backoff

### Google Drive API
- **Free tier**: 1M requests/day
- **Upload limit**: 5TB/account
- **File size**: Max 1TB per file

Our app uses ~100 requests/day per user (well below limits).

---

## Privacy & Security

### What's Stored Locally
```
browser localStorage:
  - google_client_id
  - schwab_client_id
  - schwab_token (encrypted OAuth token)
  - quantum_trades (JSON string)
  - quantum_goals (JSON string)
```

### What's Stored in Google Drive
```
QuantumWheel/ (app folder, not visible in Drive)
  ├── trades.json (encrypted if enabled)
  ├── goals.json (encrypted if enabled)
  └── backup_2025-03-24.json
```

### What's NOT Sent Anywhere
- Your brokerage account number (hashed before API calls)
- Your passwords (OAuth tokens only)
- Your personal data (stays on your device)

### Enable Encryption (Optional)
1. **Settings** → Check "Encrypt Google Drive backups"
2. Uses **AES-256** encryption
3. Key: User-derived from Client ID
4. Only you can decrypt

---

## Advanced: Custom Data Import

### From CSV (e.g., from Schwab export)
```csv
Date,Symbol,Side,Qty,Entry Price,Exit Price,P&L,ROI
2025-03-23,NVDA,BUY,10,125.50,130.25,475,3.8%
2025-03-20,AAPL,SELL,5,182.00,180.50,-75,-0.8%
```

**Import steps:**
1. Trade History → Import Backup
2. Select CSV file
3. Auto-mapped columns
4. Click "Import"

### From JSON (from another tracker)
```json
{
  "trades": [
    {
      "date": "2025-03-23",
      "symbol": "NVDA",
      "side": "BUY",
      "quantity": 10,
      "entryPrice": 125.50,
      "exitPrice": 130.25,
      "pnl": 475,
      "roi": 0.038
    }
  ]
}
```

**Import steps:**
1. Backups & Drive → Import Backup
2. Select JSON file
3. Data merges with existing trades

---

## Offline Support

### What Works Offline
- View cached trades (from last sync)
- View local charts
- Edit trade notes
- Create new trade entries (synced when online)

### What Requires Internet
- Fetch from Schwab API
- Sync to Google Drive
- OAuth login popups

### Enable Offline Mode (Default)
- IndexedDB automatically caches last 100 trades
- Service Worker (PWA) coming soon for full offline

---

## Regular Maintenance

### Weekly
- Monitor **Dashboard** → Check P&L trending
- Export to external backup if paranoid 😄

### Monthly
- Review **Reports** → Check metrics
- Set **Goals** → Adjust targets

### Quarterly
- Download **PDF Report** for tax prep
- Archive Drive backups (Files → QuantumWheel folder)

### Yearly
- Generate **Tax Report** (1099 summary)
- Rotate API credentials (new Client IDs)
- Audit trade history for accuracy

---

## Getting Help

### Check These First
1. Browser console: **F12** → **Console** tab
2. Application storage: **F12** → **Application** → **LocalStorage**
3. Network tab: Check for 403/404/500 errors

### Common Errors
| Error | Fix |
|-------|-----|
| "Unauthorized" | Reauthenticate: Sync button → new OAuth popup |
| "Invalid Client ID" | Copy-paste exactly from cloud console |
| "CORS error" | Use GitHub Pages (not local file://) |
| "Drive full" | Delete old backups in Google Drive |

### Report Issues
- Create GitHub issue with error message
- Include screenshot of console
- Describe steps to reproduce

---

## Next Steps

1. ✅ Deploy to GitHub Pages
2. ✅ Set up Google Cloud OAuth
3. ✅ Set up Schwab Developer API
4. ✅ Launch QuantumWheel
5. ✅ Sync first trade data
6. ⏭️ **Start trading & tracking!**

---

**🎉 You're all set! Go make those trades.**

Questions? Check README.md or open an issue.
