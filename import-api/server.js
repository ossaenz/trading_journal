const express = require('express');
const multer = require('multer');
const upload = multer();
const app = express();
app.use(express.json({ limit: '10mb' }));

// Simple health
app.get('/', (req, res) => res.send('Import API running'));

// Accept JSON payloads (parsed data) and return a simple acknowledgement
app.post('/import/json', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'expected array' });
  // TODO: persist to DB — sample writes to disk are omitted for safety in this scaffold
  return res.json({ received: data.length });
});

// Accept file uploads (multipart/form-data) and return parsed row count
app.post('/import/file', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  // No parsing here — client should parse and POST JSON, or server can integrate csv parser.
  return res.json({ filename: req.file.originalname, size: req.file.size });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Import API listening on', port));
