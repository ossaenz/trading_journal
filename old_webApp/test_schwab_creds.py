"""
Test if Schwab credentials are valid by sending a fake code.
- invalid_grant = credentials OK, just the code is fake (GOOD)
- invalid_client = credentials themselves are wrong (BAD)
"""
import base64, json
from urllib import request as urlreq, parse as urlparse, error as urlerr

CLIENT_ID     = "JE9j2QOYALHoWM64Dz0W0JgJFLAz7OAoG0XAdaGcebimT8HP"
CLIENT_SECRET = "HumFMt8uzwqFz9nwqG5xCJmGAGVsfh2GGwU4euRg4sEqemk1wlEnmplYNO5sVLDd"
REDIRECT_URI  = "https://ossaenz.github.io/trading_journal/"

credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
print(f"Basic Auth header: Basic {credentials[:40]}...")

data = urlparse.urlencode({
    'grant_type': 'authorization_code',
    'code': 'FAKE_TEST_CODE',
    'redirect_uri': REDIRECT_URI
}).encode()

req = urlreq.Request(
    'https://api.schwabapi.com/v1/oauth/token',
    data=data,
    headers={
        'Authorization': f'Basic {credentials}',
        'Content-Type': 'application/x-www-form-urlencoded'
    }
)

try:
    resp = urlreq.urlopen(req)
    print("200:", resp.read().decode())
except urlerr.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body}")
    parsed = json.loads(body)
    err = parsed.get('error')
    if err == 'invalid_grant':
        print("\n✓ CREDENTIALS ARE CORRECT — just needs a real auth code")
    elif err == 'invalid_client':
        print("\n✗ CREDENTIALS ARE WRONG — client_id or secret mismatch")
    else:
        print(f"\n? Unexpected error: {err}")
