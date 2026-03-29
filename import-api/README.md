import-api — scaffold

This branch contains a minimal Express app that accepts JSON imports and file uploads. It's intentionally minimal and should be secured before any production use.

To run locally:

```bash
cd import-api
npm install
npm start
```

Endpoints:
- `GET /` — health
- `POST /import/json` — accept parsed JSON array in request body
- `POST /import/file` — accept multipart file upload field `file` (returns basic metadata)

Security and next steps:
- Add authentication (API key / JWT) and rate-limiting before exposing externally.
- Implement persistent storage (DB) and idempotency checks.
- Add CSV parsing server-side if desired (e.g., `csv-parse`).
