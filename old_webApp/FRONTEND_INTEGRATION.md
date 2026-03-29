# Frontend Integration Guide

How to update `index.html` to use the secure Cloud Functions backend.

---

## Key Changes

### 1. Update Configuration

Replace the hardcoded Client IDs in setup modal with backend endpoint:

```javascript
// OLD - Client ID exposed in browser
const SCHWAB_CLIENT_ID = "your_client_id_here";
const GOOGLE_CLIENT_ID = "your_google_client_id_here";

// NEW - Backend handles secrets
const BACKEND_URL = "https://region-quantumwheel-secure.cloudfunctions.net/quantumwheel-backend";
```

### 2. OAuth Flow Changes

#### Google Drive OAuth

**OLD (Direct):**
```javascript
function authenticateGoogle() {
  const config = {
    client_id: GOOGLE_CLIENT_ID,  // Visible to anyone
    scope: 'https://www.googleapis.com/auth/drive.file',
    redirect_uri: window.location.href,
  };
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${config.client_id}&` + ...
}
```

**NEW (Secure - Backend handles secrets):**
```javascript
async function authenticateGoogle() {
  const response = await fetch(`${BACKEND_URL}/oauth/google/start`, {
    method: 'GET',
    credentials: 'include'  // Include secure cookies
  });
  
  const {authorization_url} = await response.json();
  window.location.href = authorization_url;  // Redirect to Google
}

// After Google redirect, backend exchanges code for token automatically
```

#### Schwab OAuth

**OLD (Insecure - client secret can't be used in browser):**
```javascript
async function authenticateSchwab() {
  const code = getAuthCode();  // From redirect
  
  // ❌ Can't include client_secret in browser!
  const tokenResponse = await fetch('https://api.schwabapi.com/v1/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: SCHWAB_CLIENT_ID,  // Visible
      // No client_secret!
    })
  });
}
```

**NEW (Secure - backend exchanges code):**
```javascript
async function authenticateSchwab() {
  // Step 1: Get authorization URL from backend
  const startResponse = await fetch(`${BACKEND_URL}/oauth/schwab/start`);
  const {authorization_url, state} = await startResponse.json();
  
  // Step 2: Redirect user to Schwab login
  window.location.href = authorization_url;
  
  // Step 3: Schwab redirects back with code
  // Backend automatically exchanges code for token (client_secret stays safe!)
  // Token stored in secure HTTP-only cookie
}
```

---

### 3. API Call Pattern

#### Before: Direct Schwab API

```javascript
async function getAccounts() {
  const response = await fetch('https://api.schwabapi.com/trader/v1/accounts', {
    headers: {
      'Authorization': `Bearer ${accessToken}`  // ❌ Token in browser storage
    }
  });
  return response.json();
}
```

#### After: Through Backend

```javascript
async function getAccounts() {
  const response = await fetch(
    `${BACKEND_URL}/api/schwab?endpoint=/trader/v1/accounts`,
    {
      method: 'GET',
      credentials: 'include',  // Send secure cookies with session token
      headers: {
        'Authorization': `Bearer ${sessionToken}`  // ✅ Validated session token
      }
    }
  );
  return response.json();
}
```

---

### 4. Session Management

Instead of storing tokens in localStorage:

```javascript
// OLD - Insecure
localStorage.setItem('accessToken', accessToken);
const token = localStorage.getItem('accessToken');

// NEW - Secure
// Backend returns token in HTTP-only cookie automatically
// Frontend just uses sessionToken for validation
const sessionToken = generateRandomString();  // Used only for CSRF validation
```

---

## Complete Updated Functions

### Setup Modal (Settings Tab)

```javascript
// After user enters Google/Schwab Client IDs in form, validate with backend
async function saveSetup() {
  const googleClientId = document.getElementById('google-client-id').value;
  const schwabClientId = document.getElementById('schwab-client-id').value;
  
  // Verify credentials work by testing backend
  const testResponse = await fetch(`${BACKEND_URL}/health`);
  if (!testResponse.ok) {
    alert('Backend not accessible. Check Cloud Functions deployment.');
    return;
  }
  
  // Values stored only locally, backend has them from env variables
  localStorage.setItem('googleClientId', googleClientId);
  localStorage.setItem('schwabClientId', schwabClientId);
  
  // Redirect to dashboard
  showPage('dashboard');
}
```

### Account Data Fetching

```javascript
async function fetchAccountData() {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/schwab?endpoint=/trader/v1/accounts`,
      {
        method: 'GET',
        credentials: 'include',  // ✅ Send secure cookies
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header needed - cookie handles it
        }
      }
    );
    
    if (response.status === 401) {
      // Session expired, re-authenticate
      alert('Session expired. Please log in again.');
      authenticateSchwab();
      return;
    }
    
    const data = await response.json();
    updateDashboard(data);
    
  } catch (error) {
    console.error('Failed to fetch accounts:', error);
  }
}
```

### Position Details

```javascript
async function getPositions(accountHash) {
  const response = await fetch(
    `${BACKEND_URL}/api/schwab?endpoint=/trader/v1/accounts/${accountHash}/positions`,
    {
      credentials: 'include',
      headers: {'Content-Type': 'application/json'}
    }
  );
  
  return response.json();
}
```

---

## Migration Checklist

- [ ] Add `BACKEND_URL` constant to JavaScript config
- [ ] Update all OAuth functions to use backend endpoints
- [ ] Replace direct Schwab API calls with backend proxy
- [ ] Remove access token from localStorage
- [ ] Add `credentials: 'include'` to all fetch calls
- [ ] Handle 401 responses (session expired)
- [ ] Test with Chrome DevTools (Network tab)
- [ ] Verify no tokens appear in browser console/logs
- [ ] Test on GitHub Pages deployment

---

## Testing Checklist

1. **Security Test**: Open DevTools Network tab
   - ❌ Should NOT see Bearer tokens in requests
   - ✅ Should see `secure; httponly` cookies

2. **OAuth Test**
   - Click "Authenticate Google" → redirects to Google login
   - Click "Authenticate Schwab" → redirects to Schwab login
   - Both return to your app automatically

3. **API Calls**
   - Dashboard loads account data
   - Trade history populates
   - No CORS errors
   - All data encrypted in transit (HTTPS only)

4. **Error Handling**
   - Invalid credentials → clear error message
   - Backend down → graceful fallback
   - Expired session → automatic re-auth prompt

---

## Troubleshooting

### CORS errors
```
Access to XMLHttpRequest blocked by CORS policy
```
**Fix:** Add your GitHub Pages URL to `ALLOWED_ORIGINS` in `main.py`, redeploy.

### 401 Unauthorized
```
 {"error": "Unauthorized"}
```
**Fix:** Session cookie not sent. Check:
- `credentials: 'include'` in fetch
- Backend returning Set-Cookie headers
- Browser accepting cookies from backend domain

### 500 Server Error
```
 {"error": "..."}
```
**Fix:** Check Cloud Function logs:
```bash
gcloud functions logs read quantumwheel-backend --limit 20
```

---

## Performance Notes

- **Latency**: +20-50ms per API call (backend proxy overhead)
- **Cold start**: First call after deployment ~2-3 seconds
- **Caching**: Implement client-side cache for account data (refresh every 30s)

---

See [CLOUD_FUNCTION_SETUP.md](CLOUD_FUNCTION_SETUP.md) for backend deployment.
