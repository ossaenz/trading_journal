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

  // ── 1. Redirect user to Schwab login ──────────────────────────────────────
  if (action === 'login') {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SCHWAB_CLIENT_ID,
      redirect_uri: process.env.SCHWAB_REDIRECT_URI,
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

      // On failure, redirect to app with error info so it's visible
      if (!tokenRes.ok) {
        const errMsg = encodeURIComponent(JSON.stringify(tokens));
        return res.redirect(`${appUrl}/#auth_error=${errMsg}`);
      }

      // Redirect to app with tokens in fragment (never in query string)
      return res.redirect(
        `${appUrl}/#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}&expires_in=${tokens.expires_in}`
      );
    } catch (err) {
      return res.redirect(`${appUrl}/#auth_error=${encodeURIComponent(err.message)}`);
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
