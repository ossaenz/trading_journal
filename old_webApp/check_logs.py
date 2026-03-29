import sqlite3, json
from urllib import request as urlreq, parse as urlparse

conn = sqlite3.connect('C:/Users/oscar/AppData/Roaming/gcloud/credentials.db')
creds = json.loads(conn.execute('SELECT * FROM credentials LIMIT 1').fetchone()[1])
data = urlparse.urlencode({
    'client_id': creds['client_id'], 'client_secret': creds['client_secret'],
    'refresh_token': creds['refresh_token'], 'grant_type': 'refresh_token'
}).encode()
resp = urlreq.urlopen(urlreq.Request('https://oauth2.googleapis.com/token', data=data))
TOKEN = json.loads(resp.read())['access_token']

# Check env vars
url = 'https://cloudfunctions.googleapis.com/v2/projects/my-stock-journal/locations/us-central1/functions/quantumwheel-backend'
req = urlreq.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
resp = urlreq.urlopen(req)
func = json.loads(resp.read())
env = func.get('serviceConfig', {}).get('environmentVariables', {})
print('=== ENV VARS ===')
for k, v in env.items():
    print(f'  {k} = {v[:30]}{"..." if len(v)>30 else ""}')

# Fetch logs
url2 = 'https://logging.googleapis.com/v2/entries:list'
body = json.dumps({
    'resourceNames': ['projects/my-stock-journal'],
    'filter': 'resource.type="cloud_run_revision" resource.labels.service_name="quantumwheel-backend"',
    'orderBy': 'timestamp desc',
    'pageSize': 50
}).encode()
req2 = urlreq.Request(url2, data=body, headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'})
resp2 = urlreq.urlopen(req2)
logs = json.loads(resp2.read())
print('\n=== RECENT LOGS ===')
for entry in logs.get('entries', []):
    msg = entry.get('textPayload') or json.dumps(entry.get('jsonPayload', ''))
    ts = entry.get('timestamp', '')[:19]
    print(f'{ts}  {msg}')
