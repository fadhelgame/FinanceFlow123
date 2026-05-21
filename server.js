'use strict';

require('dotenv').config();

const express    = require('express');
const session    = require('express-session');
const fs         = require('fs');
const path       = require('path');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── OAuth2 ── */
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
];

/* ── Middleware ── */
app.use(express.json({ limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'financeflow-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

/* Static files (no auto-index so we control / route) */
app.use(express.static(path.join(__dirname), { index: false }));

/* ── Helpers ── */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthenticated' });
  next();
}

function dataPath(userId) {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `db_${userId}.json`);
}

function readUser(userId) {
  try { return JSON.parse(fs.readFileSync(dataPath(userId), 'utf8')); }
  catch { return { transactions:[], budgets:{}, goals:[], accounts:[], customCats:{}, debts:[] }; }
}

function writeUser(userId, obj) {
  fs.writeFileSync(dataPath(userId), JSON.stringify(obj, null, 2), 'utf8');
}

function makeAuth(tokens) {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  c.setCredentials(tokens);
  return c;
}

/* ── Auth routes ── */
app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_')) {
    return res.redirect('/?setup=1');
  }
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    const auth = makeAuth(tokens);
    const { data: u } = await google.oauth2({ version: 'v2', auth }).userinfo.get();
    req.session.user = { id: u.id, name: u.name, email: u.email, picture: u.picture, tokens };
    res.redirect('/');
  } catch (err) {
    console.error('Auth error:', err.message);
    res.redirect('/?auth_error=1');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/auth/me', (req, res) => {
  const u = req.session.user;
  res.json(u ? { id: u.id, name: u.name, email: u.email, picture: u.picture } : null);
});

/* ── Data API ── */
app.get('/api/data', requireAuth, (req, res) => {
  res.json(readUser(req.session.user.id));
});

app.post('/api/data', requireAuth, (req, res) => {
  const { transactions, budgets, goals, accounts, customCats, debts } = req.body || {};
  if (!Array.isArray(transactions)) return res.status(400).json({ error: 'Invalid format' });
  writeUser(req.session.user.id, { transactions, budgets:{}, goals:[], accounts:[], customCats:{}, debts:[], ...req.body });
  res.json({ ok: true });
});

/* ── Voice transcription (Groq Whisper) ── */
app.post('/api/transcribe', async (req, res) => {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.includes('your_')) {
    return res.status(503).json({
      error: 'GROQ_API_KEY belum dikonfigurasi. Daftar gratis di console.groq.com lalu isi di file .env',
    });
  }
  try {
    const { audio, mimeType = 'audio/webm' } = req.body;
    if (!audio) return res.status(400).json({ error: 'Audio kosong' });

    const audioBuffer = Buffer.from(audio, 'base64');

    /* Use Node 18+ native FormData + fetch */
    const { Blob } = require('buffer');
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), 'audio.webm');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'id');
    formData.append('response_format', 'json');

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: formData,
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Groq ${resp.status}: ${txt.slice(0,200)}`);
    }
    const result = await resp.json();
    res.json({ text: result.text || '' });
  } catch (err) {
    console.error('Transcribe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── Google Drive backup / restore ── */
app.post('/api/drive/backup', requireAuth, async (req, res) => {
  try {
    const u    = req.session.user;
    const auth = makeAuth(u.tokens);
    const drv  = google.drive({ version: 'v3', auth });
    const data = readUser(u.id);
    const name = `FinanceFlow_backup.json`;

    const { Readable } = require('stream');
    const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(data, null, 2)]) };

    const list = await drv.files.list({ q: `name='${name}' and trashed=false`, fields: 'files(id)' });

    if (list.data.files.length > 0) {
      await drv.files.update({ fileId: list.data.files[0].id, media });
    } else {
      await drv.files.create({ requestBody: { name }, media, fields: 'id' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Drive backup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/drive/restore', requireAuth, async (req, res) => {
  try {
    const u    = req.session.user;
    const auth = makeAuth(u.tokens);
    const drv  = google.drive({ version: 'v3', auth });
    const name = `FinanceFlow_backup.json`;

    const list = await drv.files.list({ q: `name='${name}' and trashed=false`, fields: 'files(id,modifiedTime)' });
    if (!list.data.files.length) return res.json({ found: false });

    const { id: fileId, modifiedTime } = list.data.files[0];

    const chunks = [];
    const { data: stream } = await drv.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
    await new Promise((ok, fail) => {
      stream.on('data', c => chunks.push(c));
      stream.on('end', ok);
      stream.on('error', fail);
    });
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.json({ found: true, data, modifiedTime });
  } catch (err) {
    console.error('Drive restore error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ── Serve app ── */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`FinanceFlow → http://localhost:${PORT}`));
