// api/auth.js — Vercel Serverless Function (free tier)
// Handles Schwab OAuth 2.0 token exchange securely server-side

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // ── 1. Redirect user to Schwab login ──────────────────────────────────────
  if (action === 'login') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SCHWAB_CLIENT_ID,
      redirect_uri: process.env.SCHWAB_REDIRECT_URI,
      scope: 'readonly',
    });
    return res.redirect(
      `https://api.schwabapi.com/v1/oauth/authorize?${params}`
    );
  }

  // ── 2. Exchange authorization code for tokens ─────────────────────────────
  if (action === 'callback') {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });

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
      if (!tokenRes.ok) return res.status(400).json(tokens);

      // Redirect to app with tokens in fragment (never in query string)
      const appUrl = process.env.SCHWAB_REDIRECT_URI.replace('/api/auth?action=callback', '');
      return res.redirect(
        `${appUrl}/#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}&expires_in=${tokens.expires_in}`
      );
    } catch (err) {
      return res.status(500).json({ error: err.message });
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
