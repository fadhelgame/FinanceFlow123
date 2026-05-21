'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data', 'db.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

/* ── helpers ── */
function read() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); }
  catch { return { transactions: [], budgets: {}, goals: [], accounts: [], customCats: {}, debts: [] }; }
}

function write(obj) {
  const dir = path.dirname(DATA);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(obj, null, 2), 'utf8');
}

/* ── API ── */
app.get('/api/data', (_req, res) => res.json(read()));

app.post('/api/data', (req, res) => {
  const { transactions, budgets, goals, accounts, customCats, debts } = req.body || {};
  if (!Array.isArray(transactions))
    return res.status(400).json({ error: 'Format tidak valid' });
  write({ transactions, budgets: budgets || {}, goals: goals || [], accounts: accounts || [], customCats: customCats || {}, debts: debts || [] });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`FinanceFlow running on port ${PORT}`);
});
