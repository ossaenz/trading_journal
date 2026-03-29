# Deploy Secure Backend to Google Cloud Functions

Complete guide to secure your trading dashboard with a serverless backend.

---

## Prerequisites

- Google Cloud Account (free tier includes 2M function invocations/month)
- Google Cloud SDK installed locally ([Download](https://cloud.google.com/sdk/docs/install))
- Schwab Client Secret from your app registration

---

## Step 1: Create Google Cloud Project

```bash
# Authenticate with GCP
gcloud auth login

# Create new project
gcloud projects create quantumwheel-secure --name="QuantumWheel Secure"

# Set as active project
gcloud config set project quantumwheel-secure

# Enable required APIs
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

---

## Step 2: Store Secrets in Secret Manager

Store your sensitive credentials in **Google Cloud Secret Manager** (encrypted at rest).

```bash
# Create secrets (replace with your actual values)
echo -n "your_schwab_client_secret_here" | gcloud secrets create schwab_client_secret --data-file=-
echo -n "your_google_client_secret_here" | gcloud secrets create google_client_secret --data-file=-

# Verify created
gcloud secrets list
```

---

## Step 3: Deploy Cloud Function

```bash
cd cloud-function/

gcloud functions deploy quantumwheel-backend \
  --runtime python311 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point handle_request \
  --set-env-vars SCHWAB_CLIENT_ID=your_client_id,GOOGLE_CLIENT_ID=your_client_id,GCP_PROJECT_ID=quantumwheel-secure \
  --memory 256MB \
  --timeout 60s
```

**Output:**
```
Deploying function...done.
httpsTrigger:
  url: https://region-quantumwheel-secure.cloudfunctions.net/quantumwheel-backend
```

Copy the URL — you'll use it in the frontend.

---

## Step 4: Grant Secret Access to Cloud Function

The function needs permission to read secrets:

```bash
# Get Cloud Function service account
PROJECT_ID=$(gcloud config get-value project)
SERVICE_ACCOUNT="quantumwheel-backend@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant Secret Accessor role
gcloud secrets add-iam-policy-binding schwab_client_secret \
  --member=serviceAccount:${SERVICE_ACCOUNT} \
  --role=roles/secretmanager.secretAccessor

gcloud secrets add-iam-policy-binding google_client_secret \
  --member=serviceAccount:${SERVICE_ACCOUNT} \
  --role=roles/secretmanager.secretAccessor
```

---

## Step 5: Update Frontend

Replace direct API calls with backend proxying.

### Frontend Changes

In `index.html`, update the auth flow:

**OLD (Insecure):**
```javascript
// Direct Schwab API call (exposed client ID only)
const token = await fetch('https://api.schwabapi.com/v1/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    client_id: SCHWAB_CLIENT_ID,  // ❌ Visible to hackers
    // No client_secret possible in browser
  })
});
```

**NEW (Secure):**
```javascript
// Backend handles OAuth (client secret stays safe)
const token = await fetch('https://region-quantumwheel-secure.cloudfunctions.net/quantumwheel-backend/oauth/schwab/callback', {
  method: 'POST',
  credentials: 'include',  // Use secure cookies
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({code: authCode, state: state})
});
```

### API Call Pattern

**OLD:**
```javascript
const accounts = await fetch('https://api.schwabapi.com/trader/v1/accounts', {
  headers: {'Authorization': `Bearer ${token}`}  // ❌ Token exposed in browser
});
```

**NEW:**
```javascript
const accounts = await fetch(
  'https://region-quantumwheel-secure.cloudfunctions.net/quantumwheel-backend/api/schwab?endpoint=/trader/v1/accounts',
  {
    headers: {'Authorization': `Bearer ${sessionToken}`},  // ✅ Secure session token
    credentials: 'include'  // HTTP-only cookies
  }
);
```

---

## Step 6: Test Health Check

```bash
curl https://region-quantumwheel-secure.cloudfunctions.net/quantumwheel-backend/health
```

Expected response:
```json
{"status": "healthy"}
```

---

## Security Features Enabled ✅

| Feature | Benefit |
|---------|---------|
| **Client Secret on Backend** | Can't be stolen from browser |
| **Secure HTTP-only Cookies** | Can't be accessed via JavaScript |
| **Request Validation** | Prevents SSRF & unauthorized endpoints |
| **CORS Whitelisting** | Only GitHub Pages origin can call backend |
| **Endpoint Whitelisting** | Only approved API calls forwarded |
| **Rate Limiting** | (Add Redis in Step 7 for this) |

---

## Step 7 (Optional): Add Rate Limiting

For production, prevent abuse:

```bash
# Deploy Redis for session & rate limit storage
gcloud redis instances create quantumwheel-cache \
  --size 1 --region us-central1 \
  --redis-version 7.0
```

Then update `main.py` to use Redis for:
- Session token storage
- Rate limits per user
- CSRF state validation

---

## Monitoring & Debugging

```bash
# View logs
gcloud functions logs read quantumwheel-backend --limit 50

# View metrics
gcloud monitoring dashboards create --config-from-file=monitoring.json

# Test with verbose output
gcloud functions call quantumwheel-backend \
  --data '{"path":"/health"}'
```

---

## Cost Estimate

- **Cloud Functions**: First 2M invocations/month = FREE
- **Secret Manager**: First 6 active secrets = FREE
- **Redis** (optional): ~$5-15/month

---

## Troubleshooting

### Function returns 403 "Forbidden"
- Check service account has Secret Accessor role
- Run Step 4 again

### CORS errors in browser
- Update `ALLOWED_ORIGINS` in `main.py`
- Deploy again: `gcloud functions deploy quantumwheel-backend`

### Secret Manager access denied
```bash
gcloud secrets add-iam-policy-binding schwab_client_secret \
  --member=user:your-email@gmail.com \
  --role=roles/secretmanager.secretAccessor
```

---

## Next Steps

1. Update `index.html` to call backend instead of direct APIs
2. Add session management (store tokens server-side)
3. Implement rate limiting with Redis
4. Set up monitoring alerts
5. Enable VPC Service Controls for extra isolation

[View Updated Frontend Code](../FRONTEND_INTEGRATION.md)
