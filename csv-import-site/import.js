(() => {
  const input = document.getElementById('file-input');
  const mergeBtn = document.getElementById('merge-btn');
  const clearBtn = document.getElementById('clear-btn');
  const previewSection = document.getElementById('preview-section');
  const previewInfo = document.getElementById('preview-info');
  const previewWrap = document.getElementById('preview-table-wrap');
  const downloadJsonBtn = document.getElementById('download-json');
  const downloadCsvBtn = document.getElementById('download-csv');
  const copyBtn = document.getElementById('copy-clipboard');
  const gdriveClientInput = document.getElementById('gdrive-clientid');
  const gdriveAuthBtn = document.getElementById('gdrive-auth');
  const gdriveUploadBtn = document.getElementById('gdrive-upload');
  const gdriveStatus = document.getElementById('gdrive-status');

  let parsedFiles = [];
  let mergedData = [];

  function resetState() {
    parsedFiles = [];
    mergedData = [];
    previewWrap.innerHTML = '';
    previewSection.classList.add('hidden');
    mergeBtn.disabled = true;
    clearBtn.disabled = true;
    downloadJsonBtn.disabled = true;
    downloadCsvBtn.disabled = true;
    copyBtn.disabled = true;
    previewInfo.textContent = '';
  }

  function showPreview(data) {
    previewWrap.innerHTML = '';
    previewSection.classList.remove('hidden');
    const table = document.createElement('table');
    table.className = 'preview-table';

    const cols = Array.from(new Set(data.flatMap(Object.keys)));
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    cols.forEach(c => { const th = document.createElement('th'); th.textContent = c; headRow.appendChild(th); });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const maxRows = Math.min(200, data.length);
    for (let i=0;i<maxRows;i++) {
      const row = data[i];
      const tr = document.createElement('tr');
      cols.forEach(c => {
        const td = document.createElement('td');
        const v = row[c];
        td.textContent = v === undefined ? '' : v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    previewWrap.appendChild(table);
    previewInfo.textContent = `${data.length} total rows — showing ${maxRows}`;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], {type: mime || 'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Google Drive integration (client-side, optional) ---
  // Minimal flow: user pastes Client ID, clicks Authorize, signs in, then Upload uses Drive v3 upload endpoint.
  let driveToken = null;

  function setDriveStatus(msg) { gdriveStatus.textContent = msg || ''; }

  function saveClientIdToStorage(id) { try { localStorage.setItem('csv_gdrive_clientid', id || ''); } catch(e){} }
  function loadClientIdFromStorage() { try { return localStorage.getItem('csv_gdrive_clientid') || ''; } catch(e){return ''} }

  // Load any saved client id
  if (gdriveClientInput) {
    const saved = loadClientIdFromStorage();
    if (saved) { gdriveClientInput.value = saved; gdriveAuthBtn.disabled = false; }
    gdriveClientInput.addEventListener('input', (e) => {
      const v = (e.target.value || '').trim();
      saveClientIdToStorage(v);
      gdriveAuthBtn.disabled = v.length === 0;
    });
  }

  // Use Google Identity Services library via popup to obtain access token with Drive scope
  async function gdriveAuthorize() {
    setDriveStatus('Authorizing...');
    driveToken = null;
    const clientId = (gdriveClientInput && gdriveClientInput.value.trim()) || '';
    if (!clientId) { setDriveStatus('Missing Client ID'); return; }

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp) => {
          if (resp.error) {
            setDriveStatus('Auth error: ' + resp.error);
          } else {
            driveToken = resp.access_token;
            setDriveStatus('Authorized');
            gdriveUploadBtn.disabled = mergedData.length === 0;
          }
        }
      });
      client.requestAccessToken();
    } catch (e) {
      setDriveStatus('Authorize failed: ' + e.message);
    }
  }

  async function gdriveUpload() {
    if (!driveToken) { setDriveStatus('Not authorized'); return; }
    if (!mergedData || !mergedData.length) { setDriveStatus('No data to upload'); return; }
    setDriveStatus('Uploading...');
    const metadata = { name: 'trading-journal-backup-' + new Date().toISOString() + '.json', mimeType: 'application/json' };
    const json = JSON.stringify(mergedData, null, 2);
    const boundary = '---------csvdrive' + Date.now();
    const delimiter = '\r\n--' + boundary + '\r\n';
    const closeDelimiter = '\r\n--' + boundary + '--';

    const multipartRequestBody =
      delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
      '\r\n' + '\r\n' +
      '--' + boundary + '\r\n' + 'Content-Type: application/json\r\n\r\n' + json + closeDelimiter;

    try {
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + driveToken,
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody
      });
      if (!res.ok) {
        const txt = await res.text();
        setDriveStatus('Upload failed: ' + res.status + ' ' + txt.slice(0,200));
      } else {
        const info = await res.json();
        setDriveStatus('Uploaded: ' + info.id);
      }
    } catch (e) {
      setDriveStatus('Upload error: ' + e.message);
    }
  }

  // Wire up Drive buttons
  if (gdriveAuthBtn) gdriveAuthBtn.addEventListener('click', gdriveAuthorize);
  if (gdriveUploadBtn) gdriveUploadBtn.addEventListener('click', gdriveUpload);

  // Load Google Identity Services script dynamically so page remains static until needed
  (function loadGis(){
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  })();

  function mergeAndNormalize(filesParsed) {
    // Simple merge strategy: just concatenate rows. You can add mapping/normalization here.
    const all = filesParsed.flatMap(f => f.data || []);
    // Optionally normalize common column names (lowercase keys)
    const normalized = all.map(r => {
      const out = {};
      Object.keys(r).forEach(k => { out[k.trim()] = r[k]; });
      return out;
    });
    return normalized;
  }

  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return resetState();
    parsedFiles = [];
    mergeBtn.disabled = true;
    clearBtn.disabled = true;
    previewInfo.textContent = 'Parsing...';

    let remaining = files.length;
    files.forEach(file => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          parsedFiles.push({name: file.name, data: results.data, meta: results.meta});
          remaining -= 1;
          if (remaining === 0) {
            previewInfo.textContent = `Loaded ${parsedFiles.length} file(s).`;
            mergeBtn.disabled = false;
            clearBtn.disabled = false;
          }
        },
        error: (err) => {
          console.error('Parse error', err, file.name);
          remaining -= 1;
          if (remaining === 0) {
            previewInfo.textContent = `Loaded ${parsedFiles.length} file(s); some files failed to parse.`;
            mergeBtn.disabled = parsedFiles.length === 0;
            clearBtn.disabled = false;
          }
        }
      });
    });
  });

  mergeBtn.addEventListener('click', () => {
    mergedData = mergeAndNormalize(parsedFiles);
    showPreview(mergedData);
    downloadJsonBtn.disabled = mergedData.length === 0;
    downloadCsvBtn.disabled = mergedData.length === 0;
    copyBtn.disabled = mergedData.length === 0;
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    resetState();
  });

  downloadJsonBtn.addEventListener('click', () => {
    const json = JSON.stringify(mergedData, null, 2);
    downloadFile('trading-journal-backup.json', json, 'application/json');
  });

  downloadCsvBtn.addEventListener('click', () => {
    try {
      const csv = Papa.unparse(mergedData);
      downloadFile('trading-journal-backup.csv', csv, 'text/csv');
    } catch (e) {
      alert('Failed to convert to CSV: ' + e.message);
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(mergedData, null, 2));
      alert('JSON copied to clipboard');
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
  });

  // initialize
  resetState();
})();