const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const METADATA_FILE = path.join(__dirname, 'metadata.json');

// Ensure uploads dir and metadata file exist on startup
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(METADATA_FILE)) fs.writeFileSync(METADATA_FILE, JSON.stringify({}));

// --- Metadata helpers ---
function readMeta() {
  return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
}
function writeMeta(data) {
  fs.writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2));
}

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const id = req.fileId || (req.fileId = uuidv4());
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${id}_${safeName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const validMimes = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'];
  const validExt = /\.csv$/i.test(file.originalname);
  if (validMimes.includes(file.mimetype) || validExt) {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'), false);
  }
};

const upload = multer({ storage, fileFilter });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API key middleware ---
app.use('/api', (req, res, next) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // no key configured, allow all
  const provided = req.headers['x-api-key'];
  if (!provided || provided !== apiKey) {
    return res.status(401).json({ error: 'Invalid or missing API key.' });
  }
  next();
});

// --- GET /api/files — list all files ---
app.get('/api/files', (req, res) => {
  const meta = readMeta();
  res.json(Object.values(meta));
});

// --- POST /api/files — upload new file ---
app.post('/api/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid file type.' });

  const id = req.fileId || uuidv4();
  const alias = (req.body.name || req.file.originalname).trim();
  const meta = readMeta();

  meta[id] = {
    id,
    alias,
    originalFilename: req.file.originalname,
    storedFilename: req.file.filename,
    size: req.file.size,
    uploadedAt: new Date().toISOString(),
    mimeType: req.file.mimetype,
  };

  writeMeta(meta);
  res.status(201).json(meta[id]);
});

// --- GET /api/files/:id/raw — return raw CSV for analytics use ---
app.get('/api/files/:id/raw', (req, res) => {
  const meta = readMeta();
  const entry = meta[req.params.id];
  if (!entry) return res.status(404).json({ error: 'File not found.' });

  const filePath = path.join(UPLOADS_DIR, entry.storedFilename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from disk.' });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${entry.originalFilename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// --- GET /api/files/:id — download file ---
app.get('/api/files/:id', (req, res) => {
  const meta = readMeta();
  const entry = meta[req.params.id];
  if (!entry) return res.status(404).json({ error: 'File not found.' });

  const filePath = path.join(UPLOADS_DIR, entry.storedFilename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from disk.' });

  res.download(filePath, entry.originalFilename);
});

// --- PATCH /api/files/:id — rename alias or replace file ---
app.patch('/api/files/:id', upload.single('file'), (req, res) => {
  const meta = readMeta();
  const entry = meta[req.params.id];
  if (!entry) return res.status(404).json({ error: 'File not found.' });

  // Rename alias
  if (req.body.name) {
    entry.alias = req.body.name.trim();
  }

  // Replace file contents
  if (req.file) {
    const oldPath = path.join(UPLOADS_DIR, entry.storedFilename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    entry.originalFilename = req.file.originalname;
    entry.storedFilename = req.file.filename;
    entry.size = req.file.size;
    entry.mimeType = req.file.mimetype;
    entry.updatedAt = new Date().toISOString();
  }

  if (!req.body.name && !req.file) {
    return res.status(400).json({ error: 'Provide a new name or replacement file.' });
  }

  meta[req.params.id] = entry;
  writeMeta(meta);
  res.json(entry);
});

// --- DELETE /api/files/:id ---
app.delete('/api/files/:id', (req, res) => {
  const meta = readMeta();
  const entry = meta[req.params.id];
  if (!entry) return res.status(404).json({ error: 'File not found.' });

  const filePath = path.join(UPLOADS_DIR, entry.storedFilename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  delete meta[req.params.id];
  writeMeta(meta);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`CSV Manager running at http://localhost:${PORT}`);
});
