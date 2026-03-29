// api/auth.js — Vercel Serverless Function (free tier)
// Handles Schwab OAuth 2.0 token exchange securely server-side
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, code } = req.query;
  const appUrl = (process.env.SCHWAB_REDIRECT_URI || '').replace(/\/api\/auth.*$/, '');

  // Guard: misconfigured env vars → show clear error before redirecting
  if (!process.env.SCHWAB_CLIENT_ID || !process.env.SCHWAB_REDIRECT_URI) {
    return res.status(500).send(debugHtml('Missing env vars', {
      SCHWAB_CLIENT_ID: process.env.SCHWAB_CLIENT_ID ? 'set' : 'MISSING',
      SCHWAB_CLIENT_SECRET: process.env.SCHWAB_CLIENT_SECRET ? 'set' : 'MISSING',
      SCHWAB_REDIRECT_URI: process.env.SCHWAB_REDIRECT_URI || 'MISSING',
    }));
  }

  // ── 1. Redirect user to Schwab login ──────────────────────────────────────
  if (action === 'login') {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SCHWAB_CLIENT_ID,
      redirect_uri: process.env.SCHWAB_REDIRECT_URI,
      scope: 'readonly',
      state,
    });
    return res.redirect(
      `https://api.schwabapi.com/v1/oauth/authorize?${params}`
    );
  }

  // ── 2. Exchange authorization code for tokens ─────────────────────────────
  // Schwab redirects back to /api/auth?code=... (no action param allowed in registered URL)
  if (action === 'callback' || (code && !action)) {
    if (!code) {
      return res.redirect(`${appUrl}/#error=missing_code`);
    }

    const credentials = Buffer.from(
      `${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`
    ).toString('base64');

    try {
      const tokenRes = await fetch('https://api.schwabapi.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.SCHWAB_REDIRECT_URI,
        }),
      });

      const tokens = await tokenRes.json();

      // On failure, show an HTML debug page directly (fragments can silently
      // disappear if appUrl is wrong; an inline page is always visible)
      if (!tokenRes.ok) {
        console.error('[auth] Token exchange failed', tokenRes.status, tokens);
        return res.status(400).send(debugHtml('Token exchange failed', {
          http_status: tokenRes.status,
          schwab_error: tokens,
          redirect_uri_sent: process.env.SCHWAB_REDIRECT_URI,
          tip: 'Ensure the redirect_uri above exactly matches the one registered in developer.schwab.com',
        }));
      }

      // Redirect to app with tokens in fragment (never in query string)
      return res.redirect(
        `${appUrl}/#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}&expires_in=${tokens.expires_in}`
      );
    } catch (err) {
      console.error('[auth] Token exchange exception', err);
      return res.status(500).send(debugHtml('Token exchange exception', { error: err.message }));
    }
  }

  // ── 3. Refresh access token ───────────────────────────────────────────────
  if (action === 'refresh' && req.method === 'POST') {
    const { refresh_token } = req.body || {};
    if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

    const credentials = Buffer.from(
      `${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`
    ).toString('base64');

    try {
      const tokenRes = await fetch('https://api.schwabapi.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
        }),
      });

      const tokens = await tokenRes.json();
      return res.status(tokenRes.ok ? 200 : 400).json(tokens);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(404).json({ error: 'Unknown action' });
}

// Returns a plain HTML page that displays debug info visibly in the browser.
// Only shows keys — never logs raw tokens or secrets.
function debugHtml(title, details) {
  const rows = Object.entries(details)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:bold;white-space:nowrap">${k}</td><td style="padding:6px 12px;word-break:break-all">${JSON.stringify(v, null, 2)}</td></tr>`)
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Auth Debug — ${title}</title>
<style>body{font-family:monospace;background:#0d1117;color:#e6edf3;padding:32px}h2{color:#f85149}table{border-collapse:collapse;width:100%}tr:nth-child(odd){background:#161b22}a{color:#58a6ff}</style>
</head><body>
<h2>⚠ ${title}</h2>
<table>${rows}</table>
<p style="margin-top:24px"><a href="/">← Back to app</a></p>
</body></html>`;
}
