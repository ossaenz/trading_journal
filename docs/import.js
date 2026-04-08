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
  // Mapping & metrics UI elements
  const mappingSection = document.getElementById('mapping-section');
  const mappingPreset = document.getElementById('mapping-preset');
  const mapDate = document.getElementById('map-date');
  const mapSymbol = document.getElementById('map-symbol');
  const mapQty = document.getElementById('map-qty');
  const mapPrice = document.getElementById('map-price');
  const mapSide = document.getElementById('map-side');
  const mapComm = document.getElementById('map-comm');
  const applyMappingBtn = document.getElementById('apply-mapping');
  const metricsSection = document.getElementById('metrics-section');
  const metricsList = document.getElementById('metrics-list');
  const exportMetricsBtn = document.getElementById('export-metrics-json');

  function resetState() {
    parsedFiles = [];
    mergedData = [];
    previewWrap.innerHTML = '';
    previewSection.classList.add('hidden');
    if (mappingSection) mappingSection.classList.add('hidden');
    if (metricsSection) metricsSection.classList.add('hidden');
    mergeBtn.disabled = true;
    clearBtn.disabled = true;
    if (downloadJsonBtn) downloadJsonBtn.disabled = true;
    if (downloadCsvBtn) downloadCsvBtn.disabled = true;
    if (copyBtn) copyBtn.disabled = true;
    if (applyMappingBtn) applyMappingBtn.disabled = true;
    if (exportMetricsBtn) exportMetricsBtn.disabled = true;
    if (previewInfo) previewInfo.textContent = '';
  }

  // Wire up clear button to flush everything
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('onyx_metrics');
      localStorage.removeItem('onyx_rows');
      localStorage.removeItem('onyx_dividends');
      resetState();
      location.reload();
    });
  }

  function showPreview(data) {
    if (previewWrap) previewWrap.innerHTML = '';
    if (previewSection) previewSection.classList.remove('hidden');
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
    if (previewWrap) previewWrap.appendChild(table);
    if (previewInfo) previewInfo.textContent = `${data.length} total rows — showing ${maxRows}`;
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

  function rawRowKey(r) {
    // Schwab CSV has a unique REF # per transaction — use it if present.
    // The column is literally named 'REF #' and the value is formatted as ="123" in Excel exports.
    for (const k of Object.keys(r)) {
      if (k.trim().toUpperCase() === 'REF #' || k.trim().toUpperCase() === 'REF#') {
        const digits = String(r[k] || '').replace(/[^0-9]/g, '');
        if (digits.length > 5) return 'ref:' + digits;
      }
    }
    // Fallback: DATE + DESCRIPTION + AMOUNT uniquely identify a row
    const date = r['DATE'] || r['Date'] || r['date'] || '';
    const desc = r['DESCRIPTION'] || r['Description'] || r['description'] || '';
    const amt  = r['AMOUNT'] || r['Amount'] || r['amount'] || '';
    return String(date).trim() + '|' + String(desc).trim() + '|' + String(amt).trim();
  }

  function mergeAndNormalize(filesParsed) {
    const all = filesParsed.flatMap(f => f.data || []);

    // Always dedupe at the raw row level — prevents double-import from corrupting data
    const seenRaw = new Set();
    const deduped = [];
    let dupeCount = 0;
    all.forEach(r => {
      const key = rawRowKey(r);
      if (!seenRaw.has(key)) { seenRaw.add(key); deduped.push(r); }
      else { dupeCount++; }
    });
    if (dupeCount > 0) console.log('[TickerOS] mergeAndNormalize: removed', dupeCount, 'duplicate raw rows');

    const normalized = deduped.map(r => {
      const out = {};
      Object.keys(r).forEach(k => { out[k.trim()] = r[k]; });
      return out;
    });
    return normalized;
  }

  function detectCommonColumns(sample) {
    const keys = Object.keys(sample || {});
    const lower = keys.map(k => k.toLowerCase());
    const map = {};
    if (lower.includes('trade date') || lower.includes('date')) map.date = keys[lower.indexOf('trade date') >=0 ? lower.indexOf('trade date') : lower.indexOf('date')];
    if (lower.includes('symbol')) map.symbol = keys[lower.indexOf('symbol')];
    if (lower.includes('quantity') || lower.includes('qty')) map.qty = keys[lower.indexOf('quantity')>=0 ? lower.indexOf('quantity') : lower.indexOf('qty')];
    if (lower.includes('price')) map.price = keys[lower.indexOf('price')];
    if (lower.includes('side')) map.side = keys[lower.indexOf('side')];
    if (lower.includes('commission')) map.comm = keys[lower.indexOf('commission')];
    return map;
  }

  function parseNumber(v) { if (v === null || v === undefined || v === '') return 0; return Number(String(v).replace(/[^0-9eE+\-.]/g, '')) || 0; }
  function parseDateVal(v) { const d = new Date(v); if (isNaN(d)) return null; return d.toISOString(); }

  function normalizeRows(rows, mapping) {
    const trades = [];
    const dividends = [];
    const assignments = [];

    rows.forEach(r => {
      const out = {};
      out._raw = r;

      // Schwab CSV has TYPE column: TRD=trade, DOI=dividend/interest, EXP=exercise/assignment, BAL=balance, RAD=removal, JRN=journal, CDB=transfer
      const rowType = (r.TYPE || r.Type || r['TYPE'] || '').toString().trim().toUpperCase();

      // Get date from first column
      const dateRaw = r.DATE || r.Date || r['DATE'] || (mapping.date ? r[mapping.date] : null);
      out.date = dateRaw ? parseDateVal(dateRaw) : null;

      // Parse the DESCRIPTION for all row types
      const desc = (r.DESCRIPTION || r.Description || r['DESCRIPTION'] || '');
      const parsed = parseDescription(String(desc || ''));

      // Get AMOUNT (the actual $ value — already scaled for options)
      const amount = parseNumber(r.AMOUNT || r.Amount || r['AMOUNT'] || 0);
      // Get commissions from "Commissions & Fees" column
      const commCol = r['Commissions & Fees'] || r['Commission'] || r['Commissions'] || 0;
      const miscFees = r['Misc Fees'] || 0;
      const commission = Math.abs(parseNumber(commCol)) + Math.abs(parseNumber(miscFees));

      if (rowType === 'TRD') {
        // TRD = actual trade execution.
        // AMOUNT is positive for credits (sells) and negative for debits (buys).
        // For option trades: "SOLD -1 AAL 100 ... CALL @.25" → AMOUNT = 25.00 (already 0.25 × 100)
        // For stock trades: "BOT +1 PLTR @150.47" → AMOUNT = -150.47

        out.symbol = (parsed && parsed.symbol) ? parsed.symbol : '';
        out.side = (parsed && parsed.side) ? parsed.side : (amount >= 0 ? 'SELL' : 'BUY');
        out.optionType = (parsed && parsed.optionType) || null;
        out.strike = (parsed && parsed.strike) || null;
        out.expiry = (parsed && parsed.expiry) || null;
        out.isOption = (parsed && parsed.isOption) || false;
        out.multiplier = (parsed && parsed.multiplier) || 1;
        out.commission = commission;

        // For P&L calculation via FIFO:
        // We need qty and price such that qty × price = the actual $ flow.
        // Strategy: use parsed qty from description for contract count, and calculate effective price.
        const parsedQty = (parsed && parsed.qty) ? Math.abs(parsed.qty) : 1;

        if (out.isOption) {
          // Option trade: AMOUNT already includes the 100x multiplier
          // Price per share = AMOUNT / (qty × 100)
          out.price = Math.abs(amount) / (parsedQty * 100);
          out.qty = out.side === 'BUY' ? parsedQty : -parsedQty;
        } else {
          // Stock trade: "BOT +1 PLTR @150.47" → AMOUNT = -150.47, or "BOT +100 AAPL @178.50"
          // If parsed price exists from @, use it directly
          if (parsed && parsed.price && parsed.price > 0) {
            out.price = parsed.price;
            out.qty = out.side === 'BUY' ? parsedQty : -parsedQty;
          } else {
            // Fallback: derive from AMOUNT
            out.price = Math.abs(amount) / parsedQty;
            out.qty = out.side === 'BUY' ? parsedQty : -parsedQty;
          }
        }

        trades.push(out);

      } else if (rowType === 'DOI') {
        // Dividend or Interest income
        dividends.push({
          date: out.date,
          description: desc,
          amount: amount,
          type: 'dividend'
        });

      } else if (rowType === 'EXP') {
        // Assignment or Exercise
        // e.g., "SOLD -100.0 SPY UPON SPDR S&P 500 ETF" → assignment from short put
        // e.g., "BOT 100.0 SPY UPON ..." → assignment from short call or exercise
        const expSide = amount >= 0 ? 'SELL' : 'BUY';
        const expQtyMatch = desc.match(/(BOT|SOLD)\s+([+-]?\d+\.?\d*)\s+(\w+)/i);
        if (expQtyMatch) {
          out.symbol = expQtyMatch[3];
          out.qty = expSide === 'BUY' ? Math.abs(parseNumber(expQtyMatch[2])) : -Math.abs(parseNumber(expQtyMatch[2]));
          out.price = Math.abs(amount) / Math.abs(out.qty);
          out.side = expSide;
          out.isOption = false;
          out.optionType = null;
          out.strike = null;
          out.expiry = null;
          out.multiplier = 1;
          out.commission = commission;
          trades.push(out);
        }

      } else if (rowType === 'BAL') {
        // Balance row — extract starting balance
        // done in computeMetrics already
      }
      // RAD, JRN, CDB rows are skipped (no trade impact)
    });

    // Store dividends in localStorage for future income dashboard
    if (dividends.length) {
      try { localStorage.setItem('onyx_dividends', JSON.stringify(dividends)); } catch(e) {}
    }

    return trades;
  }

  function parseDescription(desc) {
    if (!desc) return null;
    // Examples:
    // "SOLD -1 AAL 100 (Weeklys) 2 JAN 26 15.5 CALL @.25 CBOE"
    // "BOT +1 TSLA 100 (Weeklys) 31 MAR 26 350 PUT @12.50"
    // "BOT +100 AAPL @178.50"
    const res = { qty: null, price: null, symbol: null, side: null, optionType: null, strike: null, expiry: null, isOption: false, multiplier: 1 };

    // qty and side
    const mQty = desc.match(/\b(BOT|BOUGHT|BUY|SOLD|SELL)\b\s*([+-]?\d+(?:\.\d+)?)/i);
    if (mQty) {
      const side = (mQty[1] || '').toUpperCase();
      res.side = (side === 'SOLD' || side === 'SELL') ? 'SELL' : (side === 'BOT' || side === 'BOUGHT' || side === 'BUY') ? 'BUY' : side;
      res.qty = Number(mQty[2]);
    }

    // price after @
    const mPrice = desc.match(/@\s*([0-9,]+\.?[0-9]*)/);
    if (mPrice) res.price = parseNumber(mPrice[1]);
    else {
      const allNums = desc.match(/([0-9,]+\.?[0-9]*)/g);
      if (allNums && allNums.length) {
        for (let i = allNums.length - 1; i >= 0; i--) {
          const n = parseNumber(allNums[i]);
          if (n > 0 && n < 10000) { res.price = n; break; }
        }
      }
    }

    // symbol: ticker-like token (all caps, 1-5 letters)
    const mSym = desc.match(/\b([A-Z]{1,5})(?:\s+\d+)?\b(?=\s+\(|\s+\d|\s+@|\s+\w)/);
    if (mSym) res.symbol = mSym[1];

    // Option detection: CALL or PUT keyword
    const mOptType = desc.match(/\b(CALL|PUT)\b/i);
    if (mOptType) {
      res.optionType = mOptType[1].toUpperCase();
      res.isOption = true;
    }

    // Strike price: number before CALL/PUT
    const mStrike = desc.match(/(\d+\.?\d*)\s+(CALL|PUT)\b/i);
    if (mStrike) res.strike = parseNumber(mStrike[1]);

    // Expiry: date pattern like "2 JAN 26" or "31 MAR 26" or "03/21/2026"
    const mExpiry = desc.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{2,4})/i);
    if (mExpiry) {
      const month = mExpiry[2].toUpperCase();
      const months = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
      let yr = mExpiry[3]; if (yr.length === 2) yr = '20' + yr;
      res.expiry = `${yr}-${months[month]}-${mExpiry[1].padStart(2, '0')}`;
    }

    // Multiplier detection (100 for options)
    if (res.isOption) res.multiplier = 100;

    return res;
  }

  function computeMetrics(rows) {
    const bySymbol = {};
    const metrics = { realized:0, commissions:0, trades:0, closedTrades:0, winners:0, losers:0, positions: {}, _tradeResults: [] };
    // wash sale tracking
    const washLosses = []; // {date, key, loss}
    const purchases = []; // {date, key, qty}
    let totalWinAmt = 0;
    let totalLossAmt = 0;

    // Per-symbol commission tracking
    const commBySymbol = {};
    rows.forEach(r => {
      const c = Number(r.commission||0);
      metrics.commissions += c;
      const s = r.symbol || 'UNKNOWN';
      if (!commBySymbol[s]) commBySymbol[s] = 0;
      commBySymbol[s] += c;
    });

    // Per-symbol detailed tracking
    const symStats = {}; // per-ticker: trades, winners, losers, totalWin, totalLoss, biggestWin, biggestLoss

    rows.forEach(r => {
      const s = r.symbol || 'UNKNOWN';
      if (!bySymbol[s]) bySymbol[s] = { queue: [], realized: 0 };
      if (!symStats[s]) symStats[s] = { trades: 0, winners: 0, losers: 0, totalWin: 0, totalLoss: 0, biggestWin: 0, biggestLoss: 0 };
      const bucket = bySymbol[s];
      const st = symStats[s];
      let qty = Number(r.qty||0);
      const price = Number(r.price||0);
      const mult = Number(r.multiplier||1);

      // Helper to record a closed trade P&L
      function recordPnl(pnl) {
        bucket.realized += pnl;
        metrics.realized += pnl;
        metrics.closedTrades += 1;
        metrics._tradeResults.push(pnl);
        st.trades += 1;
        if (pnl > 0) {
          metrics.winners += 1; totalWinAmt += pnl;
          st.winners += 1; st.totalWin += pnl;
          if (pnl > st.biggestWin) st.biggestWin = pnl;
        } else if (pnl < 0) {
          metrics.losers += 1; totalLossAmt += pnl;
          st.losers += 1; st.totalLoss += pnl;
          if (pnl < st.biggestLoss) st.biggestLoss = pnl;
          // record wash-sale candidate (loss amount positive)
          try {
            const key = (r.isOption ? `${r.symbol}::OPT::${r.optionType}::${r.strike}::${r.expiry}` : `${r.symbol}::STOCK`);
            washLosses.push({ date: new Date(r.date), key, loss: Math.abs(pnl) });
          } catch(e) {}
        }
      }

      if (qty > 0) {
        // BUY: first check if there are short entries to close (sell-open → buy-close pattern)
        while (qty > 0 && bucket.queue.length && bucket.queue[0].qty < 0) {
          const lot = bucket.queue[0];
          const shortQty = Math.abs(lot.qty);
          const take = Math.min(qty, shortQty);
          const lotMult = lot.mult || mult || 1;
          // Short P&L: sold high, bought low = (sell_price - buy_price) × qty × multiplier
          const pnl = take * (lot.price - price) * lotMult;
          recordPnl(pnl);
          lot.qty += take; // lot.qty is negative, adding makes closer to 0
          qty -= take;
          if (Math.abs(lot.qty) < 0.0001) bucket.queue.shift();
        }
        // Remaining qty → open long position
        if (qty > 0) {
          bucket.queue.push({ qty, price, date: r.date, mult });
          // record purchase for wash-sale detection
          try { purchases.push({ date: new Date(r.date), key: (r.isOption ? `${r.symbol}::OPT::${r.optionType}::${r.strike}::${r.expiry}` : `${r.symbol}::STOCK`), qty: Number(qty) }); } catch(e) {}
        }

      } else if (qty < 0) {
        // SELL: first check if there are long entries to close (buy → sell pattern)
        let remaining = Math.abs(qty);
        while (remaining > 0 && bucket.queue.length && bucket.queue[0].qty > 0) {
          const lot = bucket.queue[0];
          const take = Math.min(lot.qty, remaining);
          const lotMult = lot.mult || mult || 1;
          // Long P&L: bought low, sold high = (sell_price - buy_price) × qty × multiplier
          const pnl = take * (price - lot.price) * lotMult;
          recordPnl(pnl);
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= 0) bucket.queue.shift();
        }
        // Remaining → open short position
        if (remaining > 0) bucket.queue.unshift({ qty: -remaining, price, date: r.date, mult });
      }
    });

    // After processing trades, compute wash-sale disallowed losses
    metrics.washSale = 0;
    metrics.washSaleItems = [];
    try {
      const MS = 1000 * 60 * 60 * 24 * 30; // 30 days in ms
      washLosses.forEach(loss => {
        // find any purchase of a substantially identical security within ±30 days of loss date
        const found = purchases.find(p => {
          if (p.key !== loss.key) return false;
          const dt = Math.abs(new Date(p.date) - new Date(loss.date));
          return dt <= MS;
        });
        if (found) {
          metrics.washSale += Number(loss.loss || 0);
          metrics.washSaleItems.push({ date: loss.date.toISOString().slice(0,10), key: loss.key, loss: Number(loss.loss || 0), repurchaseDate: found.date ? (new Date(found.date)).toISOString().slice(0,10) : null });
        }
      });
      metrics.washSale = Number((metrics.washSale || 0).toFixed(2));
      metrics.washCount = metrics.washSaleItems.length;
    } catch(e) { console.warn('wash-sale compute err', e); }


    // Build positions with full per-ticker detail
    Object.keys(bySymbol).forEach(sym => {
      const b = bySymbol[sym];
      const st = symStats[sym] || { trades:0,winners:0,losers:0,totalWin:0,totalLoss:0,biggestWin:0,biggestLoss:0 };
      const openQty = b.queue.reduce((s,lot) => s + lot.qty, 0);
      const avgPrice = b.queue.length ? (b.queue.reduce((s,lot) => s + lot.qty*lot.price,0) / b.queue.reduce((s,lot) => s + lot.qty,0)) : 0;
      metrics.positions[sym] = {
        openQty, avgPrice: Number(avgPrice.toFixed(4)),
        realized: Number(b.realized.toFixed(2)),
        trades: st.trades,
        winners: st.winners,
        losers: st.losers,
        avgWin: st.winners ? st.totalWin / st.winners : 0,
        avgLoss: st.losers ? st.totalLoss / st.losers : 0,
        biggestWin: st.biggestWin,
        biggestLoss: st.biggestLoss,
        commissions: commBySymbol[sym] || 0
      };
    });

    metrics.trades = rows.length;
    metrics.avgWin = metrics.winners ? totalWinAmt / metrics.winners : 0;
    metrics.avgLoss = metrics.losers ? totalLossAmt / metrics.losers : 0;
    metrics.net = Number((metrics.realized - metrics.commissions).toFixed(2));
    metrics.winRate = metrics.closedTrades ? Number(((metrics.winners / metrics.closedTrades)*100).toFixed(1)) : 0;
    metrics.avgTrade = metrics.closedTrades ? Number((metrics.realized / metrics.closedTrades).toFixed(2)) : 0;
    metrics.expectancy = Number(((metrics.winRate/100 * metrics.avgWin) - ((1 - metrics.winRate/100) * Math.abs(metrics.avgLoss))).toFixed(2));
    let startingBalance = null;
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i]._raw || {};
      const type = (raw.TYPE || raw.Type || '').toString().toUpperCase();
      const balField = raw.BALANCE || raw.Balance || raw['Balance'] || raw['balance'] || raw.AMOUNT || raw.Amount || raw['AMOUNT'];
      if (type === 'BAL' && balField) { startingBalance = parseNumber(balField); break; }
      if (!startingBalance && balField) { startingBalance = parseNumber(balField); }
    }
    metrics.startingBalance = startingBalance;
    metrics.roiPercent = startingBalance ? Number(((metrics.net / startingBalance) * 100).toFixed(2)) : null;
    return metrics;
  }

  function renderMetrics(metrics, rows) {
    // Save to localStorage
    try {
        localStorage.setItem('onyx_metrics', JSON.stringify(metrics));
      // also expose computed wash-sale to the UI input used by dashboard
      try { localStorage.setItem('tickeros_wash_sale', String(metrics.washSale || 0)); } catch(e) {}
        if (rows) localStorage.setItem('onyx_rows', JSON.stringify(rows));
    } catch (e) {
        console.warn('Could not save to localStorage', e);
    }

    // Dispatch event — app.js handles all DOM hydration
    window.dispatchEvent(new CustomEvent('onyxDataUpdated', { detail: { metrics, rows } }));
    
    // Switch to dashboard tab automatically
    const dashTab = document.querySelector('.nav-item[data-tab="dashboard"]');
    if (dashTab) dashTab.click();
  }

  input.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return resetState();
    parsedFiles = [];
    if (mergeBtn) mergeBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    if (previewInfo) previewInfo.textContent = 'Parsing...';

    let remaining = files.length;
    files.forEach(file => {
      // Parse without header first to detect and skip preamble lines (some broker statements include title lines)
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rows = results.data || [];
            // find header row: look for a row containing 'date' and either 'amount' or 'symbol' or 'description'
            let headerRowIndex = rows.findIndex(r => {
              const joined = r.map(c => String(c||'').toLowerCase()).join('|');
              return joined.includes('date') && (joined.includes('amount') || joined.includes('symbol') || joined.includes('description') || joined.includes('qty') || joined.includes('quantity'));
            });
            if (headerRowIndex === -1) headerRowIndex = 0; // fall back to first row
            const headerRow = rows[headerRowIndex].map(h => String(h||'').trim());
            const dataRows = rows.slice(headerRowIndex + 1).map(r => {
              const obj = {};
              headerRow.forEach((h, i) => { obj[h || `col_${i}`] = (r[i] === undefined ? '' : r[i]); });
              return obj;
            });
            parsedFiles.push({ name: file.name, data: dataRows, meta: { headerRowIndex, parsedRows: dataRows.length } });
          } catch (err) {
            console.error('Parse transform error', err, file.name);
          }
          remaining -= 1;
          if (remaining === 0) {
            if (previewInfo) previewInfo.textContent = `Loaded ${parsedFiles.length} file(s).`;
            if (mergeBtn) mergeBtn.disabled = false;
            if (clearBtn) clearBtn.disabled = false;
          }
        },
        error: (err) => {
          console.error('Parse error', err, file.name);
          remaining -= 1;
          if (remaining === 0) {
            if (previewInfo) previewInfo.textContent = `Loaded ${parsedFiles.length} file(s); some files failed to parse.`;
            if (mergeBtn) mergeBtn.disabled = parsedFiles.length === 0;
            if (clearBtn) clearBtn.disabled = false;
          }
        }
      });
    });
  });

  mergeBtn.addEventListener('click', () => {
    const skipDuplicates = (document.getElementById && document.getElementById('skip-duplicates') && document.getElementById('skip-duplicates').checked) || false;
    mergedData = mergeAndNormalize(parsedFiles, skipDuplicates);
    showPreview(mergedData);
    if (downloadJsonBtn) downloadJsonBtn.disabled = mergedData.length === 0;
    if (downloadCsvBtn) downloadCsvBtn.disabled = mergedData.length === 0;
    if (copyBtn) copyBtn.disabled = mergedData.length === 0;
    // show mapping UI and auto-detect columns from sample
    if (mappingSection) mappingSection.classList.remove('hidden');
    const sample = mergedData[0] || {};
    const auto = detectCommonColumns(sample);
    if (auto.date && mapDate) mapDate.value = auto.date;
    if (auto.symbol && mapSymbol) mapSymbol.value = auto.symbol;
    if (auto.qty && mapQty) mapQty.value = auto.qty;
    if (auto.price && mapPrice) mapPrice.value = auto.price;
    if (auto.side && mapSide) mapSide.value = auto.side;
    if (auto.comm && mapComm) mapComm.value = auto.comm;
    if (applyMappingBtn) applyMappingBtn.disabled = false;
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    resetState();
  });

  if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener('click', () => {
      const json = JSON.stringify(mergedData, null, 2);
      downloadFile('trading-journal-backup.json', json, 'application/json');
    });
  }

  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      try {
        const csv = Papa.unparse(mergedData);
        downloadFile('trading-journal-backup.csv', csv, 'text/csv');
      } catch (e) {
        alert('Failed to convert to CSV: ' + e.message);
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(mergedData, null, 2));
        alert('JSON copied to clipboard');
      } catch (e) {
        alert('Copy failed: ' + e.message);
      }
    });
  }

  // Apply mapping -> normalize rows and compute metrics
  if (applyMappingBtn) {
    applyMappingBtn.addEventListener('click', () => {
      const mapping = {
        date: mapDate.value.trim() || null,
        symbol: mapSymbol.value.trim() || null,
        qty: mapQty.value.trim() || null,
        price: mapPrice.value.trim() || null,
        side: mapSide.value.trim() || null,
        comm: mapComm.value.trim() || null
      };
      const normalized = normalizeRows(mergedData, mapping);
      const metrics = computeMetrics(normalized);
      renderMetrics(metrics, normalized);
    });
  }

  if (exportMetricsBtn) {
    exportMetricsBtn.addEventListener('click', () => {
      const mapping = {
        date: mapDate.value.trim() || null,
        symbol: mapSymbol.value.trim() || null,
        qty: mapQty.value.trim() || null,
        price: mapPrice.value.trim() || null,
        side: mapSide.value.trim() || null,
        comm: mapComm.value.trim() || null
      };
      const normalized = normalizeRows(mergedData, mapping);
      const metrics = computeMetrics(normalized);
      downloadFile('trading-journal-metrics.json', JSON.stringify(metrics, null, 2), 'application/json');
    });
  }

  if (mappingPreset) {
    mappingPreset.addEventListener('change', () => {
      const val = mappingPreset.value;
      if (val === 'tos') {
        mapDate.value = 'Date'; mapSymbol.value = 'Symbol'; mapQty.value = 'Quantity'; mapPrice.value = 'Price'; mapSide.value = 'Action'; mapComm.value = 'Commission';
      } else if (val === 'schwab') {
        mapDate.value = 'DATE'; mapSymbol.value = 'SYMBOL'; mapQty.value = 'QUANTITY'; mapPrice.value = 'PRICE'; mapSide.value = 'SIDE'; mapComm.value = 'COMMISSION';
      } else {
        // auto or custom: leave as-is
      }
      applyMappingBtn.disabled = false;
    });
  }

  // initialize
  resetState();
  // Wire up dedupe button (backup + remove duplicate rows)
  const dedupeBtn = document.getElementById('dedupe-btn');
  if (dedupeBtn) {
    dedupeBtn.addEventListener('click', () => {
      try {
        const raw = localStorage.getItem('onyx_rows');
        if (!raw) { alert('No stored rows found'); return; }
        const rows = JSON.parse(raw);
        if (!Array.isArray(rows)) { alert('Stored rows are not an array'); return; }

        const seen = new Set();
        const filtered = [];
        rows.forEach(r => {
          const key = makeNormalizedRowKey(r);
          if (!seen.has(key)) { seen.add(key); filtered.push(r); }
        });

        const removed = rows.length - filtered.length;
        if (removed === 0) { alert('No duplicates found in stored rows (' + rows.length + ' rows)'); return; }

        const backupKey = 'onyx_rows_backup_' + new Date().toISOString();
        localStorage.setItem(backupKey, raw);
        localStorage.setItem('onyx_rows', JSON.stringify(filtered));
        localStorage.removeItem('onyx_metrics');
        localStorage.removeItem('onyx_dividends');
        alert('Removed ' + removed + ' duplicate rows (' + rows.length + ' → ' + filtered.length + '). Backup saved. Reloading...');
        location.reload();
      } catch (e) {
        console.error('Dedupe failed', e);
        alert('Dedupe failed: ' + e.message);
      }
    });
  }

  // Expose programmatic dedupe + recompute for app startup
  // Build a stable dedupe key for a normalized trade row.
  // Prefers REF # from _raw (unique per Schwab trade), falls back to trade fingerprint.
  function makeNormalizedRowKey(r) {
    const rawRow = r._raw || {};
    // Look for REF # across possible key casings
    const refVal = rawRow['REF #'] || rawRow['Ref #'] || rawRow['ref #'] || rawRow['REF#'] || rawRow['RefNo'] || rawRow['REFNO'] || '';
    const refNum = String(refVal).replace(/[^0-9]/g, '');
    if (refNum.length > 5) return 'ref:' + refNum;
    // Fallback: fingerprint from normalized fields
    return [
      r.date || '',
      r.symbol || '',
      r.side || '',
      r.qty !== undefined ? String(r.qty) : '',
      r.price !== undefined ? Number(r.price).toFixed(4) : '',
      r.strike || '',
      r.expiry || ''
    ].join('|');
  }

  window.onyxDedupeStored = function() {
    try {
      const raw = localStorage.getItem('onyx_rows');
      if (!raw) return { changed: false, message: 'no_rows' };
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows)) return { changed: false, message: 'not_array' };

      const seen = new Set();
      const filtered = [];
      rows.forEach(r => {
        const key = makeNormalizedRowKey(r);
        if (!seen.has(key)) { seen.add(key); filtered.push(r); }
      });

      if (filtered.length === rows.length) return { changed: false, original: rows.length, filtered: filtered.length };

      const backupKey = 'onyx_rows_backup_' + new Date().toISOString();
      localStorage.setItem(backupKey, raw);
      localStorage.setItem('onyx_rows', JSON.stringify(filtered));
      localStorage.removeItem('onyx_metrics');
      localStorage.removeItem('onyx_dividends');
      return { changed: true, original: rows.length, filtered: filtered.length, backupKey };
    } catch (e) {
      return { changed: false, message: e.message };
    }
  };

  window.onyxRecomputeFromStored = function() {
    try {
      const raw = localStorage.getItem('onyx_rows');
      if (!raw) return null;
      const rows = JSON.parse(raw) || [];
      // rows should already be normalized (stored by renderMetrics)
      const metrics = computeMetrics(rows);
      renderMetrics(metrics, rows);
      return metrics;
    } catch (e) {
      console.error('Recompute failed', e);
      return null;
    }
  };
})();