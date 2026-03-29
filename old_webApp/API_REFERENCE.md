# API Integration Reference

Quick reference for testing & debugging Schwab + Google Drive APIs.

---

## Schwab Trader API

### Base URL
```
https://api.schwabapi.com/trader/v1
```

### Authentication
```javascript
// OAuth 2.0 client-side popup
const config = {
  client_id: 'YOUR_SCHWAB_CLIENT_ID',
  redirect_uri: 'https://yourusername.github.io/trading_journal/callback',
  response_type: 'code',
  state: generateRandomState(),
  scope: 'PlaceTrades,AccountAccessRead'
};

// User pasted "code" from redirect → exchange for token
const token = await fetch('https://api.schwabapi.com/v1/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    client_id: config.client_id,
    // Note: client_secret NOT used in browser (public client)
    redirect_uri: config.redirect_uri
  })
});
```

### Key Endpoints

#### Get Accounts
```
GET /accounts
Headers: Authorization: Bearer {token}

Response:
{
  "accounts": [
    {
      "accountNumber": "hash-of-account",  // Already hashed by Schwab
      "accountType": "individual",
      "accountHolderType": "individual",
      "displayName": "Brokerage",
      "balances": {
        "totalAccountValue": 142509.32,
        "liquidationValue": 142509.32,
        "cashBalance": 15200.50,
        "cashReceipts": 0.0,
        "marginBalance": 0.0,
        "availableFundsForTrading": 15200.50,
        "availableFundsForWithdrawal": 15200.50
      }
    }
  ]
}
```

#### Get Positions
```
GET /accounts/{accountHash}/positions
Headers: Authorization: Bearer {token}

Response:
{
  "positions": [
    {
      "symbol": "NVDA",
      "quantity": 10,
      "averagePrice": 120.50,
      "currentPrice": 130.25,
      "currentValue": 1302.50,
      "unrealizedGain": 97.50,
      "unrealizedGainPercent": 8.1,
      "assetType": "EQUITY",
      "positionType": "LONG",
      "dayGain": 15.00,
      "dayGainPercent": 1.2
    },
    {
      "symbol": "SPY 400C 04/18/2025",
      "quantity": 5,
      "currentPrice": 2.50,
      "currentValue": 1250.00,
      "unrealizedGain": -250.00,
      "assetType": "OPTION"
    }
  ]
}
```

#### Get Orders (Trade History)
```
GET /accounts/{accountHash}/orders
Query params:
  - maxResults: 100
  - status: ALL, PENDING_ACTIVATION, FILLED, EXPIRED, CANCELLED, REJECTED
  
Headers: Authorization: Bearer {token}

Response:
{
  "orders": [
    {
      "orderId": "12345678",
      "placedTime": "2025-03-23T14:32:00Z",
      "quantity": 10,
      "price": 125.50,
      "orderType": "LIMIT",
      "status": "FILLED",
      "orderStrategyType": "SINGLE",
      "orderLegCollection": [
        {
          "symbol": "NVDA",
          "quantity": 10,
          "instruction": "BUY",
          "positionEffect": "OPEN",
          "assetType": "EQUITY"
        }
      ]
    }
  ]
}
```

### Error Handling
```javascript
// Rate limit: 120 requests/minute
if (response.status === 429) {
  // Exponential backoff
  await sleep(2 ** attempt * 1000);  // 1s, 2s, 4s, 8s, 16s
  retry();
}

// Unauthorized: Token expired or revoked
if (response.status === 401) {
  // Refresh token or re-authenticate
  showAuthModal();
}

// Forbidden: Account access denied
if (response.status === 403) {
  // User may not have Trader API access approved
  alert('Schwab Trader API not approved for your account yet');
}
```

---

## Google Drive API v3

### Base URL
```
https://www.googleapis.com/drive/v3
```

### Authentication
```javascript
// Google OAuth 2.0 client-side popup
gapi.auth2.getAuthInstance().signIn().then(user => {
  const token = user.getAuthResponse().id_token;
  // Now use in API calls
});
```

### Key Endpoints

#### List App Folder Files
```
GET /files
Query params:
  - spaces: 'appDataFolder'  // Private app folder (not visible to user)
  - q: "name='trades.json' or name='goals.json'"
  - fields: 'files(id, name, modifiedTime, size)'
  
Headers: Authorization: Bearer {access_token}

Response:
{
  "files": [
    {
      "kind": "drive#file",
      "id": "file-id-xyz",
      "name": "trades.json",
      "mimeType": "application/json",
      "modifiedTime": "2025-03-24T14:32:00.000Z",
      "size": "45230"
    }
  ]
}
```

#### Create File
```
POST /files
Headers:
  - Authorization: Bearer {access_token}
  - Content-Type: application/json

Body:
{
  "name": "trades.json",
  "mimeType": "application/json",
  "parents": ["appDataFolder"]
}

Then:
PUT /files/{fileId}?uploadType=media
Body: {actual file content}
```

#### Update File
```
PATCH /files/{fileId}?uploadType=media
Headers: Authorization: Bearer {access_token}
Body: {new encrypted JSON content}
```

#### Download File
```
GET /files/{fileId}?alt=media
Headers: Authorization: Bearer {access_token}

Returns: Raw file content
```

---

## Testing with cURL

### Schwab API Test
```bash
# 1. Get auth code (manual step: paste URL in browser)
curl -X GET \
  "https://api.schwabapi.com/v1/oauth/authorize?client_id=YOUR_ID&redirect_uri=your_uri&response_type=code&scope=PlaceTrades,AccountAccessRead"

# 2. Exchange code for token
curl -X POST https://api.schwabapi.com/v1/oauth/token \
  -d "grant_type=authorization_code&code=YOUR_CODE&client_id=YOUR_ID&redirect_uri=your_uri"

# 3. Get accounts
curl -X GET https://api.schwabapi.com/trader/v1/accounts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Google API Test
```bash
# Get OAuth token (interactive, use browser)
# Then test with token

curl -X GET \
  "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)" \
  -H "Authorization: Bearer YOUR_GOOGLE_TOKEN"
```

---

## Browser Console Debugging

### Check Stored Tokens
```javascript
// In browser console (F12 → Console):
localStorage.getItem('schwab_token');
localStorage.getItem('google_client_id');
localStorage.getItem('quantum_trades');

// View IndexedDB
// F12 → Application → IndexedDB → QuantumWheel
```

### Test Schwab API from Console
```javascript
async function testSchwab() {
  const token = localStorage.getItem('schwab_token');
  const response = await fetch('https://api.schwabapi.com/trader/v1/accounts', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
}

testSchwab().then(data => console.log(data));
```

### Test Google Drive API
```javascript
async function testGoogleDrive() {
  try {
    const response = await gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      pageSize: 10
    });
    console.log(response.result.files);
  } catch (error) {
    console.error('Error:', error);
  }
}

testGoogleDrive();
```

---

## Mock Data for Testing

### Sample Schwab Account Response
```json
{
  "accounts": [
    {
      "accountNumber": "abc123def456",
      "accountType": "individual",
      "displayName": "My Brokerage",
      "balances": {
        "totalAccountValue": 142509.32,
        "cashBalance": 15200.50,
        "availableFundsForTrading": 15200.50
      }
    }
  ]
}
```

### Sample Trade JSON
```json
{
  "trades": [
    {
      "id": "t1",
      "date": "2025-03-23",
      "symbol": "NVDA",
      "side": "BUY",
      "quantity": 10,
      "entryPrice": 125.50,
      "exitPrice": 130.25,
      "pnl": 475.00,
      "roi": 0.038,
      "holdDays": 2,
      "category": "swing",
      "assetType": "EQUITY"
    },
    {
      "id": "t2",
      "date": "2025-03-20",
      "symbol": "SCHD",
      "side": "DIVIDEND",
      "quantity": 100,
      "entryPrice": 32.10,
      "exitPrice": 32.10,
      "pnl": 61.00,
      "roi": 0.0,
      "category": "dividend",
      "assetType": "EQUITY"
    }
  ],
  "goals": {
    "targetReturn": 15,
    "targetWinrate": 65,
    "targetMonthly": 1
  },
  "lastSync": "2025-03-24T14:32:00Z"
}
```

---

## Rate Limiting & Retries

### Schwab Rate Limit (120/min)
```javascript
const retryWithBackoff = async (fn, maxRetries = 5) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s, 8s, 16s
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

// Usage
retryWithBackoff(() => 
  fetch('https://api.schwabapi.com/trader/v1/accounts', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
);
```

---

## Common Response Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 200 | OK | Success ✓ |
| 401 | Unauthorized | Re-authenticate, token expired |
| 403 | Forbidden | Insufficient permissions / Trader API not approved |
| 404 | Not Found | Invalid account hash or file ID |
| 429 | Too Many Requests | Rate limited, use exponential backoff |
| 500 | Server Error | Schwab/Google API issue, retry later |

---

## Production Checklist

Before going live:

- [ ] Test OAuth flows in incognito mode
- [ ] Verify account hashing (Schwab requires this)
- [ ] Test rate limit handling (429 response)
- [ ] Verify Drive folder creation (first sync)
- [ ] Test encryption/decryption round-trip
- [ ] Verify CSV/Excel export
- [ ] Test PDF generation
- [ ] Check localStorage quota (5-10MB typical)
- [ ] Verify error notifications show properly
- [ ] Test offline mode (disable network)

---

**Happy trading! 📊**
