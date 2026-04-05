const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '4mb' }));

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.join(__dirname, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'schwab_tokens.json');
const OAUTH_STATE_FILE = path.join(DATA_DIR, 'oauth_state.json');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');
const SCHWAB_RAW_FILE = path.join(DATA_DIR, 'schwab_raw_transactions.json');

const cfg = {
  clientId: process.env.SCHWAB_CLIENT_ID || '',
  clientSecret: process.env.SCHWAB_CLIENT_SECRET || '',
  redirectUri: process.env.SCHWAB_REDIRECT_URI || '',
  scope: process.env.SCHWAB_SCOPE || 'readonly',
  authorizeUrl: process.env.SCHWAB_OAUTH_AUTHORIZE_URL || 'https://api.schwabapi.com/v1/oauth/authorize',
  tokenUrl: process.env.SCHWAB_OAUTH_TOKEN_URL || 'https://api.schwabapi.com/v1/oauth/token',
  apiBase: process.env.SCHWAB_API_BASE || 'https://api.schwabapi.com',
};

ensureDataFiles();

app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasClientId: Boolean(cfg.clientId), hasRedirectUri: Boolean(cfg.redirectUri) });
});

app.get('/api/auth/schwab/status', (_req, res) => {
  const tokens = readJson(TOKENS_FILE, {});
  const expiresAt = tokens.expires_at || null;
  const now = Date.now();
  res.json({
    connected: Boolean(tokens.access_token || tokens.refresh_token),
    hasAccessToken: Boolean(tokens.access_token),
    hasRefreshToken: Boolean(tokens.refresh_token),
    expiresAt,
    expired: expiresAt ? now >= expiresAt : null,
  });
});

app.get('/api/auth/schwab/start', (req, res) => {
  if (!cfg.clientId || !cfg.redirectUri) {
    return res.status(400).json({ error: 'Missing SCHWAB_CLIENT_ID or SCHWAB_REDIRECT_URI in .env' });
  }

  const state = crypto.randomBytes(18).toString('hex');
  writeJson(OAUTH_STATE_FILE, { state, created_at: Date.now() });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
  });

  const authUrl = `${cfg.authorizeUrl}?${params.toString()}`;
  if (req.query.json === '1') return res.json({ authUrl });
  return res.redirect(authUrl);
});

app.get('/api/auth/schwab/callback', async (req, res) => {
  try {
    const { code, state, error, error_description: errorDescription } = req.query;
    if (error) throw new Error(`${error}: ${errorDescription || 'authorization failed'}`);
    if (!code) throw new Error('Missing code in callback query string');

    const expected = readJson(OAUTH_STATE_FILE, {}).state;
    if (!expected || state !== expected) throw new Error('Invalid OAuth state value');

    const tokenResp = await exchangeToken({ grantType: 'authorization_code', code });
    writeTokens(tokenResp);

    return res.status(200).send(`
      <html><body style="font-family:system-ui;padding:24px;">
        <h2>Schwab Connected</h2>
        <p>OAuth completed successfully. You can return to TickerOS and click "Sync Schwab".</p>
      </body></html>
    `);
  } catch (err) {
    return res.status(500).send(`<pre>OAuth callback failed: ${escapeHtml(err.message)}</pre>`);
  }
});

app.post('/api/auth/schwab/refresh', async (_req, res) => {
  try {
    const tokens = readJson(TOKENS_FILE, {});
    if (!tokens.refresh_token) return res.status(400).json({ error: 'No refresh token stored' });

    const tokenResp = await exchangeToken({ grantType: 'refresh_token', refreshToken: tokens.refresh_token });
    writeTokens(tokenResp, tokens.refresh_token);
    return res.json({ ok: true, expiresAt: readJson(TOKENS_FILE, {}).expires_at || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/schwab/accounts', async (_req, res) => {
  try {
    const access = await getValidAccessToken();
    const url = `${cfg.apiBase}/trader/v1/accounts/accountNumbers`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${access}` },
      timeout: 30000,
    });
    return res.json({ ok: true, accounts: Array.isArray(data) ? data : [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/schwab/transactions', async (req, res) => {
  try {
    const access = await getValidAccessToken();
    const accountHash = req.query.accountHash;
    if (!accountHash) return res.status(400).json({ error: 'Missing accountHash query parameter' });

    const fromDate = req.query.fromDate || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const toDate = req.query.toDate || new Date().toISOString().slice(0, 10);
    const types = req.query.types || 'TRADE';

    const url = `${cfg.apiBase}/trader/v1/accounts/${encodeURIComponent(accountHash)}/transactions`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${access}` },
      params: { startDate: fromDate, endDate: toDate, types },
      timeout: 45000,
    });

    return res.json({ ok: true, accountHash, count: Array.isArray(data) ? data.length : 0, transactions: Array.isArray(data) ? data : [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/trades/sync-schwab', async (req, res) => {
  try {
    const access = await getValidAccessToken();
    const fromDate = req.body?.fromDate || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const toDate = req.body?.toDate || new Date().toISOString().slice(0, 10);
    const txTypes = req.body?.types || 'TRADE';

    const acctUrl = `${cfg.apiBase}/trader/v1/accounts/accountNumbers`;
    const acctResp = await axios.get(acctUrl, {
      headers: { Authorization: `Bearer ${access}` },
      timeout: 30000,
    });
    const accounts = Array.isArray(acctResp.data) ? acctResp.data : [];

    const allRaw = [];
    for (const acct of accounts) {
      const accountHash = acct.hashValue || acct.accountHash || acct.accountNumber;
      if (!accountHash) continue;
      const txUrl = `${cfg.apiBase}/trader/v1/accounts/${encodeURIComponent(accountHash)}/transactions`;
      const txResp = await axios.get(txUrl, {
        headers: { Authorization: `Bearer ${access}` },
        params: { startDate: fromDate, endDate: toDate, types: txTypes },
        timeout: 45000,
      });
      const txs = Array.isArray(txResp.data) ? txResp.data : [];
      txs.forEach(tx => allRaw.push({ accountHash, tx }));
    }

    writeJson(SCHWAB_RAW_FILE, { synced_at: new Date().toISOString(), count: allRaw.length, rows: allRaw });

    const normalized = allRaw.map(({ accountHash, tx }) => normalizeSchwabTransaction(tx, accountHash)).filter(Boolean);
    const existingStore = readJson(TRADES_FILE, { trades: [], balances: [] });
    const existing = existingStore.trades || [];
    const merged = mergeDedupeTrades(existing, normalized);

    writeJson(TRADES_FILE, {
      updated_at: new Date().toISOString(),
      source: 'schwab_api',
      trades: merged,
      balances: Array.isArray(existingStore.balances) ? existingStore.balances : [],
    });

    return res.json({
      ok: true,
      accounts: accounts.length,
      fetchedTransactions: allRaw.length,
      normalizedTrades: normalized.length,
      totalStoredTrades: merged.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/storage/trades', (_req, res) => {
  const data = readJson(TRADES_FILE, { trades: [], balances: [] });
  res.json({
    ok: true,
    ...data,
    trades: Array.isArray(data.trades) ? data.trades : [],
    balances: Array.isArray(data.balances) ? data.balances : [],
  });
});

app.post('/api/storage/trades', (req, res) => {
  const trades = Array.isArray(req.body?.trades) ? req.body.trades : null;
  const balances = Array.isArray(req.body?.balances) ? req.body.balances : [];
  if (!trades) return res.status(400).json({ error: 'Body must contain trades[]' });
  writeJson(TRADES_FILE, {
    updated_at: new Date().toISOString(),
    source: 'frontend_manual',
    trades,
    balances,
  });
  return res.json({ ok: true, saved: trades.length, savedBalances: balances.length });
});

app.post('/api/storage/backup-localstorage', (req, res) => {
  const trades = Array.isArray(req.body?.trades) ? req.body.trades : [];
  const backupFile = path.join(DATA_DIR, `local_backup_${Date.now()}.json`);
  writeJson(backupFile, { saved_at: new Date().toISOString(), trades });
  return res.json({ ok: true, file: path.basename(backupFile), count: trades.length });
});

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TOKENS_FILE)) writeJson(TOKENS_FILE, {});
  if (!fs.existsSync(OAUTH_STATE_FILE)) writeJson(OAUTH_STATE_FILE, {});
  if (!fs.existsSync(TRADES_FILE)) writeJson(TRADES_FILE, { trades: [], balances: [] });
  if (!fs.existsSync(SCHWAB_RAW_FILE)) writeJson(SCHWAB_RAW_FILE, { rows: [] });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_err) {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

async function exchangeToken({ grantType, code, refreshToken }) {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error('Missing SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET, or SCHWAB_REDIRECT_URI in .env');
  }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const form = new URLSearchParams({
    grant_type: grantType,
    redirect_uri: cfg.redirectUri,
  });
  if (grantType === 'authorization_code') form.set('code', code);
  if (grantType === 'refresh_token') form.set('refresh_token', refreshToken);

  const { data } = await axios.post(cfg.tokenUrl, form.toString(), {
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeout: 30000,
  });

  return data;
}

function writeTokens(tokenResp, fallbackRefreshToken = '') {
  const now = Date.now();
  const expiresIn = Number(tokenResp.expires_in || 0) * 1000;
  const accessToken = tokenResp.access_token || '';
  const refreshToken = tokenResp.refresh_token || fallbackRefreshToken || '';

  writeJson(TOKENS_FILE, {
    ...tokenResp,
    access_token: accessToken,
    refresh_token: refreshToken,
    obtained_at: now,
    expires_at: expiresIn ? now + expiresIn : null,
  });
}

async function getValidAccessToken() {
  const tokens = readJson(TOKENS_FILE, {});
  const now = Date.now();
  if (tokens.access_token && tokens.expires_at && now < tokens.expires_at - 60000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    throw new Error('No valid access token. Connect Schwab first at /api/auth/schwab/start');
  }

  const refreshed = await exchangeToken({ grantType: 'refresh_token', refreshToken: tokens.refresh_token });
  writeTokens(refreshed, tokens.refresh_token);
  return readJson(TOKENS_FILE, {}).access_token;
}

function normalizeSchwabTransaction(tx, accountHash) {
  const item = tx || {};
  const instrument = item.instrument || item?.transferItems?.[0]?.instrument || {};
  const symbol = instrument.symbol || item.symbol || '';
  const dateRaw = item.tradeDate || item.transactionDate || item.settlementDate || item.activityDate || item.activityTime || null;
  const date = dateRaw ? String(dateRaw).slice(0, 10) : null;

  const qty = Math.abs(Number(item.quantity || item.positionQuantity || item?.transferItems?.[0]?.amount || 0)) || 1;
  const price = Math.abs(Number(item.price || item.netPrice || item?.transferItems?.[0]?.price || 0)) || 0;

  const commission = Math.abs(Number(item.fees?.commission || item.commission || 0))
    + Math.abs(Number(item.fees?.regFee || 0))
    + Math.abs(Number(item.fees?.secFee || 0))
    + Math.abs(Number(item.fees?.additionalFee || 0));

  const amount = Number(item.netAmount || item.amount || 0);
  const sideText = `${item.transactionSubType || ''} ${item.type || ''} ${item.description || ''}`.toUpperCase();
  const side = sideText.includes('SELL') ? 'SELL' : sideText.includes('BUY') ? 'BUY' : 'SELL';

  let type = 'STOCK';
  if (instrument.assetType === 'OPTION' || /\bCALL\b/.test(sideText)) type = 'CALL';
  if (instrument.assetType === 'OPTION' || /\bPUT\b/.test(sideText)) type = /\bPUT\b/.test(sideText) ? 'PUT' : type;

  if (!symbol || !date) return null;

  return {
    id: item.transactionId || item.activityId || `${date}-${symbol}-${qty}-${price}-${amount}`,
    date,
    symbol,
    type,
    rawSymbol: symbol,
    side,
    qty,
    price,
    commission: +commission.toFixed(2),
    pnl: +((Number.isFinite(amount) ? amount : 0) - commission).toFixed(2),
    source: 'schwab_api',
    accountHash,
  };
}

function mergeDedupeTrades(existing, incoming) {
  const out = [];
  const seen = new Set();
  const put = t => {
    const key = t.id || `${t.date}|${t.symbol}|${t.side}|${t.qty}|${t.price}|${t.pnl}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  (existing || []).forEach(put);
  (incoming || []).forEach(put);
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const certPath = process.env.SSL_CERT_PATH;
const keyPath = process.env.SSL_KEY_PATH;

if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const opts = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
  https.createServer(opts, app).listen(PORT, () => {
    console.log(`TickerOS HTTPS server listening on https://127.0.0.1:${PORT}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`TickerOS HTTP server listening on http://127.0.0.1:${PORT}`);
    console.log('Set SSL_CERT_PATH and SSL_KEY_PATH in .env to serve HTTPS for Schwab callback.');
  });
}
