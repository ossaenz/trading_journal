// api/schwab.js — Vercel Serverless Proxy (free tier)
// Forwards authenticated requests to Schwab API, avoids CORS issues

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const { endpoint } = req.query;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

  // Whitelist allowed Schwab endpoints for security
  const ALLOWED = [
    '/trader/v1/accounts',
    '/trader/v1/accounts/',
    '/trader/v1/orders',
    '/marketdata/v1/quotes',
    '/marketdata/v1/pricehistory',
  ];

  const decoded = decodeURIComponent(endpoint);
  const allowed = ALLOWED.some((e) => decoded.startsWith(e));
  if (!allowed) return res.status(403).json({ error: 'Endpoint not allowed' });

  // Build Schwab URL with any extra query params
  const { endpoint: _e, ...rest } = req.query;
  const qs = new URLSearchParams(rest).toString();
  const url = `https://api.schwabapi.com${decoded}${qs ? '?' + qs : ''}`;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
