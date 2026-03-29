# ⬡ Turkey Trading Dashboard
### Free Professional Trading Journal powered by Charles Schwab API

---

## 🚀 Deploy in 5 Steps

### 1. Register Your App with Schwab
1. Go to [developer.schwab.com](https://developer.schwab.com)
2. Create an app → choose **"Individual Trader"**
3. Set redirect URI to: `https://YOUR-APP.vercel.app/api/auth`
	(Schwab requires an exact redirect URI match; do NOT include query string parameters.)
4. Note your **Client ID** and **Client Secret**

### 2. Clone & Install
```bash
git clone <your-repo>
cd schwab-dashboard
npm install -g vercel
```

### 3. Set Environment Variables in Vercel
```bash
vercel env add SCHWAB_CLIENT_ID
vercel env add SCHWAB_CLIENT_SECRET
vercel env add SCHWAB_REDIRECT_URI
# SCHWAB_REDIRECT_URI = https://YOUR-APP.vercel.app/api/auth
```

### 4. Deploy
```bash
vercel --prod
```

### 5. Connect Your Account
Open your Vercel URL → Click **"Connect Charles Schwab Account"** → Authorize via OAuth.

---

## 📁 Project Structure
```
schwab-dashboard/
├── api/
│   ├── auth.js        ← OAuth handler (login, callback, token refresh)
│   └── schwab.js      ← Secure API proxy (prevents CORS + hides tokens)
├── public/
│   ├── index.html     ← Full dashboard UI
│   └── js/
│       └── app.js     ← All chart logic, API calls, analytics engine
└── vercel.json        ← Routing config
```

## 🔐 Security Notes
- Your **Client Secret** lives ONLY in Vercel env vars (server-side). It never touches the browser.
- OAuth tokens are stored in `localStorage` (browser-side only, never sent to any third party).
- The `/api/schwab.js` proxy **whitelists endpoints** — only approved Schwab URLs can be called.
- Tokens auto-refresh via the `/api/auth?action=refresh` endpoint.

---

## 💡 Roadmap Ideas
- [ ] Options Greeks dashboard (Delta, Theta decay tracker)
- [ ] AI trade notes via Claude API
- [ ] Email alerts for position changes
- [ ] Multi-account support
- [ ] Portfolio backtesting
- [ ] Webhook → Slack/Discord alerts on fills
