CSV Import & Backup — Trading Journal

This folder is a standalone static site that you can publish to GitHub Pages or host as static files. It is intentionally isolated and does not modify or interact with your existing Vercel app.

Contents

- `index.html` — Single-file UI for loading CSVs, previewing, and exporting JSON/CSV.
- `import.js` — Parsing and export logic (uses PapaParse via CDN).
- `style.css` — Minimal styles.

Deploy to GitHub Pages

Option A — Publish from `gh-pages` branch (recommended, keeps it separate):

1. Create a branch that contains ONLY the contents of `csv-import-site/`.
2. Push it and set GitHub Pages to serve from the `gh-pages` branch (Repository > Settings > Pages).

Quick local steps:

```bash
# from repo root
git checkout --orphan gh-pages
# remove all files from index
git rm -rf .
cp -r csv-import-site/* .
git add .
git commit -m "gh-pages: add csv-import-site"
git push origin gh-pages --force
```

Option B — Use the `/docs` folder in this repo

1. Move or copy the folder contents into `/docs` and configure Pages to serve from `main` / `docs`.

Google Drive Backup

Manual (easy):
- Use the Download JSON / Download CSV buttons from the page.
- Upload the saved file into your Google Drive via drive.google.com.

Automated (optional):
- To allow direct uploads from the page you'll need to create a Google Cloud OAuth Client ID and enable the Drive API. That requires adding client-side OAuth code and publishing your app's OAuth consent screen. I can add an optional Drive upload feature if you provide a Google OAuth Client ID and confirm you want that.
Automated (optional):
- To allow direct uploads from the page you'll need to create a Google Cloud OAuth Client ID and enable the Drive API. That requires adding client-side OAuth code and publishing your app's OAuth consent screen.

Quick Google Drive setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create an OAuth 2.0 Client ID (Application type: Web application). For authorized JavaScript origins, you can leave blank for local testing or add your GitHub Pages origin (e.g., https://<your-username>.github.io).
3. Copy the Client ID and paste it into the page input. Click "Authorize Drive" and sign in.
4. After authorizing, use "Upload JSON to Drive" to save the parsed data directly to your Drive (files are created with the `drive.file` scope — accessible only to the signed-in account unless you share them).

Security notes

- The site is entirely client-side; tokens are stored only in memory during the session and not sent to any server by default. If you do use the server import endpoint (below), send tokens securely.
- If you want server-side Drive uploads (service account), tell me and I can scaffold that separately.

Notes & Next Steps

- This page is intentionally static and client-side only: data never leaves the browser unless you download or upload it manually.
- If you'd like server-side import endpoints (to push the parsed data into your existing app DB), tell me and I will scaffold a secure `/api/import` endpoint in a separate branch, without touching your Vercel app.

If you want me to add direct Google Drive upload support now, or scaffold a server-side import endpoint in a new branch, say which and I'll proceed (again, no modifications to your current Vercel app).