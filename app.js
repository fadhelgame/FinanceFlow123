'use strict';

/* ===== KONSTANTA ===== */
const LS_TX    = 'ff_tx_idr_v2';
const LS_BUD   = 'ff_bud_idr_v2';
const LS_GOALS = 'ff_goals_v1';
const LS_ACCS  = 'ff_accs_v1';
const LS_CATS  = 'ff_cats_v1';
const LS_DEBTS = 'ff_debts_v1';
const LS_THEME = 'ff_theme';

const DEFAULT_ACCOUNTS = [
  { id: 'cash',   name: 'Dompet Tunai', icon: '👛', color: '#00d4aa', type: 'cash',   initialBalance: 0 },
  { id: 'bank',   name: 'Rekening Bank', icon: '🏦', color: '#6c63ff', type: 'bank',  initialBalance: 0 },
];

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

/* Base categories — always present, read-only keys */
const BASE_CATS = {
  /* Pengeluaran */
  food:          { label:'Makan & Minum',    icon:'🍕', color:'#ff9f43', type:'expense' },
  shopping:      { label:'Belanja',           icon:'🛍️', color:'#ee5a24', type:'expense' },
  transport:     { label:'Transportasi',      icon:'🚗', color:'#0abde3', type:'expense' },
  entertainment: { label:'Hiburan',           icon:'🎮', color:'#9b59b6', type:'expense' },
  health:        { label:'Kesehatan',         icon:'💊', color:'#e84393', type:'expense' },
  housing:       { label:'Tempat Tinggal',    icon:'🏠', color:'#f9ca24', type:'expense' },
  utilities:     { label:'Utilitas',          icon:'⚡', color:'#6c5ce7', type:'expense' },
  education:     { label:'Pendidikan',        icon:'📚', color:'#55efc4', type:'expense' },
  travel:        { label:'Perjalanan',        icon:'✈️', color:'#74b9ff', type:'expense' },
  subscriptions: { label:'Langganan',         icon:'📺', color:'#a29bfe', type:'expense' },
  /* Pendapatan */
  salary:        { label:'Gaji',              icon:'💼', color:'#00d4aa', type:'income' },
  freelance:     { label:'Freelance',         icon:'🖥️', color:'#26de81', type:'income' },
  investment:    { label:'Investasi',         icon:'📊', color:'#fd9644', type:'income' },
  rental:        { label:'Pendapatan Sewa',   icon:'🏡', color:'#45aaf2', type:'income' },
  bonus:         { label:'Bonus',             icon:'🎁', color:'#fed330', type:'income' },
  other:         { label:'Lainnya',           icon:'📦', color:'#636e72', type:'both' },
};

/* CATS is merged at runtime with custom categories */
let CATS = { ...BASE_CATS };
let customCats = {}; // { key: { label, icon, color, type } } — user-created

function rebuildCats() {
  CATS = { ...BASE_CATS, ...customCats };
}

const EXPENSE_CATS = () => Object.entries(CATS)
  .filter(([,v]) => v.type === 'expense' || v.type === 'both')
  .map(([k]) => k);
const INCOME_CATS  = () => Object.entries(CATS)
  .filter(([,v]) => v.type === 'income' || v.type === 'both')
  .map(([k]) => k);

/* ===== STATE ===== */
let transactions = [];
let budgets      = {};
let goals        = [];
let accounts     = [];
let debts        = [];
let selectedAccountId = null; // null = semua akun
let currentMonth = new Date().getMonth();
let currentYear  = new Date().getFullYear();
let selectedType = 'expense';
let editingId    = null;
let editingGoalId = null;
let depositGoalId = null;
let editingAccId  = null;
let currentPage  = 'dashboard';

let chartOverview = null;
let chartCategory = null;
let chartTrend    = null;
let chartSavings  = null;

/* ===== HELPERS ===== */
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const rnd  = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const pad  = n => String(n).padStart(2,'0');
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

/* Format penuh: Rp 8.500.000 */
function fmtCurrency(n) {
  return 'Rp ' + Math.round(Math.abs(n)).toLocaleString('id-ID');
}

/* Format kompak untuk stat card: Rp 8,5 Jt */
function fmtCompact(n) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + 'Rp ' + (abs/1e9).toFixed(1).replace('.0','') + ' M';
  if (abs >= 1e6) return sign + 'Rp ' + (abs/1e6).toFixed(1).replace('.0','') + ' Jt';
  if (abs >= 1e3) return sign + 'Rp ' + (abs/1e3).toFixed(0) + ' Rb';
  return sign + fmtCurrency(abs);
}

function fmtDateShort(str) {
  const d = new Date(str+'T00:00:00');
  return d.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ===== SAMPEL DATA ===== */
function generateSampleData() {
  const data = [];
  const now  = new Date();

  const salaries   = [8500000, 8500000, 9000000, 8500000, 9500000, 8500000];
  const freelances = [0, 2500000, 1500000, 0, 3000000, 2000000];

  for (let i = 5; i >= 0; i--) {
    let m = now.getMonth() - i;
    let y = now.getFullYear();
    if (m < 0) { m += 12; y--; }

    const D = day => toIso(new Date(y, m, Math.min(day, 28)));

    // Pendapatan
    data.push({ id:uid(), type:'income', category:'salary',    description:'Gaji Bulanan',        amount:salaries[5-i],   date:D(1),          note:'' });
    if (freelances[5-i] > 0)
      data.push({ id:uid(), type:'income', category:'freelance', description:'Proyek Freelance',   amount:freelances[5-i], date:D(rnd(12,20)), note:'' });
    if (i === 2)
      data.push({ id:uid(), type:'income', category:'bonus',    description:'Bonus Kinerja',       amount:2500000,         date:D(15),         note:'Bonus kuartal' });

    // Pengeluaran tetap
    data.push({ id:uid(), type:'expense', category:'housing',       description:'Sewa Kos/Apartemen',  amount:3500000,             date:D(1),          note:'' });
    data.push({ id:uid(), type:'expense', category:'utilities',     description:'Tagihan Listrik',     amount:rnd(250000,450000),  date:D(rnd(15,20)), note:'' });
    data.push({ id:uid(), type:'expense', category:'subscriptions', description:'Netflix, Spotify, dll.', amount:95000,            date:D(5),          note:'' });

    // Pengeluaran variabel
    data.push({ id:uid(), type:'expense', category:'food',      description:'Belanja Sembako',     amount:rnd(350000,650000), date:D(rnd(3,7)),   note:'' });
    data.push({ id:uid(), type:'expense', category:'food',      description:'Makan di Restoran',   amount:rnd(75000,250000),  date:D(rnd(9,13)),  note:'' });
    if (Math.random()>0.3)
      data.push({ id:uid(), type:'expense', category:'food',    description:'Kopi & Jajan',        amount:rnd(25000,75000),   date:D(rnd(14,22)), note:'' });
    data.push({ id:uid(), type:'expense', category:'transport', description:'Bensin / Transportasi', amount:rnd(150000,350000), date:D(rnd(6,10)), note:'' });
    if (Math.random()>0.5)
      data.push({ id:uid(), type:'expense', category:'transport', description:'Ojek Online',       amount:rnd(50000,150000),  date:D(rnd(15,25)), note:'' });
    if (Math.random()>0.35)
      data.push({ id:uid(), type:'expense', category:'shopping',  description:'Belanja Online',    amount:rnd(150000,800000), date:D(rnd(10,25)), note:'' });
    if (Math.random()>0.5)
      data.push({ id:uid(), type:'expense', category:'health',    description:'Apotek / Klinik',   amount:rnd(50000,250000),  date:D(rnd(5,20)),  note:'' });
    if (Math.random()>0.6)
      data.push({ id:uid(), type:'expense', category:'entertainment', description:'Bioskop / Acara', amount:rnd(50000,200000), date:D(rnd(8,22)), note:'' });
    if (i === 1 || i === 4)
      data.push({ id:uid(), type:'expense', category:'travel',    description:'Perjalanan Akhir Pekan', amount:rnd(500000,1500000), date:D(rnd(12,20)), note:'' });
  }

  return data;
}

function defaultBudgets() {
  return {
    food:1000000, shopping:500000, transport:500000, entertainment:300000,
    health:300000, housing:4000000, utilities:500000, education:300000,
    travel:1000000, subscriptions:150000, other:300000
  };
}

/* ===== DATA PERSISTENCE ===== */
let useServer = false;

async function loadData() {
  showLoading(true);
  try {
    const res = await fetch('/api/data', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    useServer    = true;
    transactions = data.transactions || [];
    budgets      = (data.budgets && Object.keys(data.budgets).length) ? data.budgets : defaultBudgets();
    goals        = data.goals    || [];
    accounts     = (data.accounts && data.accounts.length) ? data.accounts : DEFAULT_ACCOUNTS;
    customCats   = data.customCats || {};
    debts        = data.debts || [];
    rebuildCats();
    if (!transactions.length) {
      transactions = generateSampleData();
      await saveData();
    }
  } catch {
    // Fallback: localStorage
    useServer = false;
    try {
      const t = localStorage.getItem(LS_TX);
      const b = localStorage.getItem(LS_BUD);
      const g = localStorage.getItem(LS_GOALS);
      const a  = localStorage.getItem(LS_ACCS);
      const cc = localStorage.getItem(LS_CATS);
      const dd = localStorage.getItem(LS_DEBTS);
      transactions = t ? JSON.parse(t) : generateSampleData();
      budgets      = b ? JSON.parse(b) : defaultBudgets();
      goals        = g ? JSON.parse(g) : [];
      accounts     = a  ? JSON.parse(a)  : DEFAULT_ACCOUNTS;
      customCats   = cc ? JSON.parse(cc) : {};
      debts        = dd ? JSON.parse(dd) : [];
      rebuildCats();
      if (!t) saveData();
    } catch {
      transactions = generateSampleData();
      budgets = defaultBudgets();
      goals = [];
    }
  } finally {
    showLoading(false);
  }
}

async function saveData() {
  if (useServer) {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, budgets, goals, accounts, customCats, debts })
      });
      return;
    } catch { /* fallthrough to localStorage */ }
  }
  try {
    localStorage.setItem(LS_TX,    JSON.stringify(transactions));
    localStorage.setItem(LS_BUD,   JSON.stringify(budgets));
    localStorage.setItem(LS_GOALS, JSON.stringify(goals));
    localStorage.setItem(LS_ACCS,  JSON.stringify(accounts));
    localStorage.setItem(LS_CATS,  JSON.stringify(customCats));
    localStorage.setItem(LS_DEBTS, JSON.stringify(debts));
  } catch {}
}

/* ===== LOADING ===== */
function showLoading(on) {
  const el = document.getElementById('loadingOverlay');
  if (on) { el.classList.remove('hidden'); }
  else    { el.classList.add('hidden'); }
}

/* ===== BULAN ===== */
function updateMonthLabel() {
  document.getElementById('monthLabel').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
}

/* ===== TOAST ===== */
function toast(msg, type='success', duration=3000) {
  const icon = type==='success' ? '✅' : type==='error' ? '❌' : type==='warn' ? '⚠️' : 'ℹ️';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icon}</span><span>${escHtml(msg)}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

/* ===== TEMA ===== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(LS_THEME, theme);
  updateThemeBtn(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'light' ? 'dark' : 'light');
}

function updateThemeBtn(theme) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  if (theme === 'light') {
    // Moon icon → switch ke dark
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.title = 'Ganti ke Mode Gelap';
  } else {
    // Sun icon → switch ke light
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    btn.title = 'Ganti ke Mode Terang';
  }
}

/* ===== CHART DEFAULTS ===== */
Chart.defaults.color = '#8892a4';
Chart.defaults.font.family = "Inter, -apple-system, sans-serif";
Chart.defaults.font.size   = 12;

function destroyChart(ref) { if (ref) ref.destroy(); return null; }

/* ===== FILTER BULAN ===== */
function getMonthTx(m, y) {
  m = m ?? currentMonth; y = y ?? currentYear;
  return transactions.filter(t => {
    const d = new Date(t.date+'T00:00:00');
    return d.getMonth()===m && d.getFullYear()===y;
  });
}

const sumIncome  = txs => txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
const sumExpense = txs => txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);

/* ===== ANIMASI NILAI ===== */
function animateValue(id, target, format) {
  const el = document.getElementById(id);
  const start = parseFloat(el.dataset.val||0)||0;
  el.dataset.val = target;
  const steps = 28, dur = 550;
  let step = 0;
  const iv = setInterval(() => {
    step++;
    const v = start + (target-start)*(step/steps);
    el.textContent = format(v);
    if (step >= steps) { el.textContent = format(target); clearInterval(iv); }
  }, dur/steps);
}

/* ===== RENDER DASBOR ===== */
function renderDashboard() {
  renderAccountsBar();
  const txs      = getMonthTx().filter(t => !selectedAccountId || (t.accountId || accounts[0]?.id) === selectedAccountId);
  const income   = sumIncome(txs);
  const expenses = sumExpense(txs);
  const balance  = selectedAccountId
    ? getAccountBalance(selectedAccountId)
    : getTotalBalance();
  const saved    = income - expenses;
  const rate     = income > 0 ? Math.max(0, Math.round(saved/income*100)) : 0;

  /* Kartu stat */
  animateValue('totalBalance',    balance,   fmtCompact);
  animateValue('monthlyIncome',   income,    fmtCompact);
  animateValue('monthlyExpenses', expenses,  fmtCompact);
  document.getElementById('savingsRate').textContent = rate+'%';
  document.getElementById('savingsAmt').textContent  = fmtCompact(Math.max(0,saved))+' disimpan';

  /* Perubahan saldo vs bulan lalu */
  let pm=currentMonth-1, py=currentYear;
  if (pm<0) { pm=11; py--; }
  const prevTxs = getMonthTx(pm,py);
  const prevNet = sumIncome(prevTxs)-sumExpense(prevTxs);
  const currNet = income-expenses;
  const chEl = document.getElementById('balanceChange');
  if (prevNet !== 0) {
    const pct = ((currNet-prevNet)/Math.abs(prevNet)*100).toFixed(1);
    chEl.textContent  = `${pct>0?'+':''}${pct}% vs bulan lalu`;
    chEl.className    = `stat-change ${parseFloat(pct)>=0?'pos':'neg'}`;
  } else {
    chEl.textContent  = 'Sepanjang waktu';
    chEl.className    = 'stat-change';
  }

  /* Jumlah transaksi */
  const inTxs = txs.filter(t=>t.type==='income');
  const exTxs = txs.filter(t=>t.type==='expense');
  document.getElementById('incomeCount').textContent  = `${inTxs.length} transaksi`;
  document.getElementById('expenseCount').textContent = `${exTxs.length} transaksi`;

  /* Bar progres */
  const mx = Math.max(income, expenses, 1);
  setTimeout(() => {
    document.getElementById('incomeBar').style.width  = (income/mx*100)+'%';
    document.getElementById('expenseBar').style.width = (expenses/mx*100)+'%';
  }, 50);

  /* Ring tabungan */
  const circum = 2*Math.PI*24; // 150.8
  setTimeout(() => {
    document.getElementById('savingsRing').style.strokeDashoffset = circum - (rate/100*circum);
  }, 80);

  renderOverviewChart();
  renderCategoryChart(txs);
  renderCategorySidebar(txs);

  const sorted = [...transactions].sort((a,b) => new Date(b.date)-new Date(a.date));
  renderTxList(document.getElementById('recentList'), sorted.slice(0,7));
}

/* ===== GRAFIK OVERVIEW ===== */
function renderOverviewChart() {
  const labels=[], incD=[], expD=[];
  for (let i=5; i>=0; i--) {
    let m=currentMonth-i, y=currentYear;
    if (m<0) { m+=12; y--; }
    labels.push(MONTHS[m].slice(0,3));
    const t=getMonthTx(m,y);
    incD.push(sumIncome(t));
    expD.push(sumExpense(t));
  }

  chartOverview = destroyChart(chartOverview);
  chartOverview = new Chart(document.getElementById('overviewChart'), {
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Pendapatan', data:incD, borderColor:'#00d4aa', backgroundColor:'rgba(0,212,170,0.08)',
          borderWidth:2.5, pointBackgroundColor:'#00d4aa', pointRadius:4, pointHoverRadius:7, tension:0.45, fill:true },
        { label:'Pengeluaran', data:expD, borderColor:'#ff6b6b', backgroundColor:'rgba(255,107,107,0.08)',
          borderWidth:2.5, pointBackgroundColor:'#ff6b6b', pointRadius:4, pointHoverRadius:7, tension:0.45, fill:true },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:'#0f1625', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
          padding:12, cornerRadius:10,
          callbacks:{ label: c => ` ${c.dataset.label}: ${fmtCurrency(c.raw)}` }
        }
      },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' }, border:{ dash:[4,4] } },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, border:{ dash:[4,4] },
            ticks:{ callback: v => fmtCompact(v) } }
      }
    }
  });
}

/* ===== GRAFIK KATEGORI ===== */
function renderCategoryChart(txs) {
  const totals={};
  txs.filter(t=>t.type==='expense').forEach(t => {
    totals[t.category] = (totals[t.category]||0) + t.amount;
  });

  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
  const total  = sorted.reduce((s,[,v])=>s+v, 0);

  document.getElementById('donutTotal').textContent = fmtCompact(total);

  chartCategory = destroyChart(chartCategory);
  const legendEl = document.getElementById('categoryLegend');

  if (!sorted.length) {
    legendEl.innerHTML = '<p style="color:var(--text3);font-size:12px;text-align:center;padding:8px 0">Belum ada pengeluaran bulan ini</p>';
    return;
  }

  const labels = sorted.map(([k]) => CATS[k]?.label||k);
  const data   = sorted.map(([,v]) => v);
  const colors = sorted.map(([k]) => CATS[k]?.color||'#636e72');

  chartCategory = new Chart(document.getElementById('categoryChart'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderColor:'rgba(0,0,0,0.25)', borderWidth:2, hoverOffset:8 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'72%',
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:'#0f1625', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, cornerRadius:10,
          callbacks:{ label: c => ` ${c.label}: ${fmtCurrency(c.raw)} (${Math.round(c.raw/total*100)}%)` }
        }
      }
    }
  });

  legendEl.innerHTML = sorted.slice(0,5).map(([k,v]) => `
    <div class="cat-legend-row">
      <span class="cat-legend-dot" style="background:${CATS[k]?.color||'#636e72'}"></span>
      <span class="cat-legend-name">${CATS[k]?.label||k}</span>
      <span class="cat-legend-pct">${Math.round(v/total*100)}%</span>
      <span class="cat-legend-amt">${fmtCompact(v)}</span>
    </div>
  `).join('');
}

/* ===== SIDEBAR KATEGORI ===== */
function renderCategorySidebar(txs) {
  const totals={};
  txs.filter(t=>t.type==='expense').forEach(t => {
    totals[t.category] = (totals[t.category]||0) + t.amount;
  });

  const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const el = document.getElementById('categorySidebar');

  if (!sorted.length) {
    el.innerHTML = '<p style="font-size:12px;color:var(--text3);padding:4px 6px">Belum ada data</p>';
    return;
  }

  el.innerHTML = sorted.map(([k,v]) => `
    <div class="cat-sidebar-item">
      <span class="cat-sidebar-dot" style="background:${CATS[k]?.color||'#636e72'}"></span>
      <span class="cat-sidebar-name">${CATS[k]?.icon||'📦'} ${CATS[k]?.label||k}</span>
      <span class="cat-sidebar-amt">${fmtCompact(v)}</span>
    </div>
  `).join('');
}

/* ===== DAFTAR TRANSAKSI ===== */
function renderTxList(container, list) {
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <p>Belum ada transaksi</p>
      <small>Klik "Tambah Transaksi" untuk memulai</small>
    </div>`;
    return;
  }

  container.innerHTML = list.map(t => {
    const cat = CATS[t.category] || CATS.other;
    return `
    <div class="tx-item" data-id="${t.id}">
      <div class="tx-icon" style="background:${cat.color}1a;border:1px solid ${cat.color}30">${cat.icon}</div>
      <div class="tx-info">
        <div class="tx-name">${escHtml(t.description)}</div>
        <div class="tx-meta">
          <span class="tx-cat">${cat.label}</span>
          <span class="tx-sep"></span>
          <span class="tx-date">${fmtDateShort(t.date)}</span>
          ${t.recurring ? `<span class="tx-sep"></span><span class="tx-recurring-badge">🔁 Berulang</span>` : ''}
          ${t.note ? `<span class="tx-sep"></span><span class="tx-cat" title="${escHtml(t.note)}">📝</span>` : ''}
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${t.type}">${t.type==='income'?'+':'-'}${fmtCurrency(t.amount)}</div>
        <div class="tx-actions">
          <button class="tx-act-btn" onclick="openModal('${t.id}')" title="Edit">✏️</button>
          <button class="tx-act-btn del" onclick="deleteTx('${t.id}')" title="Hapus">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ===== HALAMAN TRANSAKSI ===== */
function renderTransactionsPage() {
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const typeF  = document.getElementById('typeFilter').value;
  const catF   = document.getElementById('categoryFilter').value;

  let filtered = transactions.filter(t => {
    const d = new Date(t.date+'T00:00:00');
    const inMonth  = d.getMonth()===currentMonth && d.getFullYear()===currentYear;
    const matchS   = !search || t.description.toLowerCase().includes(search) ||
                     (CATS[t.category]?.label||'').toLowerCase().includes(search);
    const matchT   = !typeF || t.type===typeF;
    const matchC   = !catF  || t.category===catF;
    const matchAcc = !selectedAccountId || (t.accountId || accounts[0]?.id) === selectedAccountId;
    return inMonth && matchS && matchT && matchC && matchAcc;
  });

  filtered.sort((a,b) => new Date(b.date)-new Date(a.date));

  document.getElementById('txCount').textContent = `${filtered.length} transaksi`;

  const listEl  = document.getElementById('allList');
  const emptyEl = document.getElementById('emptyState');

  if (!filtered.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    const hasFilters = search || typeF || catF;
    emptyEl.querySelector('p').textContent = hasFilters
      ? 'Transaksi tidak ditemukan'
      : 'Belum ada transaksi bulan ini';
    emptyEl.querySelector('small').textContent = hasFilters
      ? 'Coba hapus filter atau gunakan kata kunci lain.'
      : 'Klik tombol di bawah untuk mencatat pemasukan atau pengeluaran pertama Anda!';

    // Add CTA button if not already present
    if (!emptyEl.querySelector('.empty-cta')) {
      const cta = document.createElement('div');
      cta.className = 'empty-cta';
      cta.innerHTML = `<button class="btn-primary" id="emptyAddTxBtn">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        <span>Tambah Transaksi</span>
      </button>`;
      emptyEl.appendChild(cta);
      emptyEl.querySelector('#emptyAddTxBtn')?.addEventListener('click', () => {
        if (hasFilters) {
          document.getElementById('searchInput').value = '';
          document.getElementById('typeFilter').value = '';
          document.getElementById('categoryFilter').value = '';
          renderTransactionsPage();
        }
        openModal();
      });
    }
  } else {
    emptyEl.style.display = 'none';
    renderTxList(listEl, filtered);
  }
}

/* ===== HALAMAN ANGGARAN ===== */
function renderBudgetPage() {
  const txs    = getMonthTx();
  const totals = {};
  txs.filter(t=>t.type==='expense').forEach(t => {
    totals[t.category] = (totals[t.category]||0) + t.amount;
  });

  const el = document.getElementById('budgetList');
  const rows = EXPENSE_CATS().map(k => {
    const cat   = CATS[k];
    const spent = totals[k]||0;
    const limit = budgets[k]||0;
    if (!limit && !spent) return '';

    const pct    = limit > 0 ? Math.min(Math.round(spent/limit*100), 100) : 0;
    const status = pct>=100 ? 'over' : pct>=80 ? 'warn' : 'ok';
    const color  = pct>=100 ? 'var(--expense)' : pct>=80 ? 'var(--warning)' : 'var(--text)';
    const sisa   = limit - spent;

    const emoji = limit ? getBudgetEmoji(pct) : '';
    return `
    <div class="budget-item">
      <div class="budget-item-header">
        <div class="budget-cat-info">
          <span>${cat.icon}</span>
          <span class="budget-cat-name">${cat.label}</span>
          ${emoji ? `<span class="budget-status-emoji">${emoji}</span>` : ''}
        </div>
        <div class="budget-amounts">
          <strong style="color:${color}">${fmtCompact(spent)}</strong>
          ${limit
            ? ` <span style="color:var(--text3)">/ ${fmtCompact(limit)}</span>
                <span style="color:${color};font-weight:600;margin-left:6px">${pct}%</span>`
            : '<span style="color:var(--text3);font-style:italic"> — tidak ada batas</span>'}
        </div>
      </div>
      ${limit ? `
      <div class="budget-bar">
        <div class="budget-bar-fill bfill-${status}" style="width:${pct}%"></div>
      </div>
      <div class="budget-pct">${sisa>=0
          ? `Sisa ${fmtCompact(sisa)}`
          : `<span style="color:var(--expense)">Melebihi anggaran ${fmtCompact(Math.abs(sisa))}!</span>`}
      </div>` : ''}
    </div>`;
  }).filter(Boolean);

  el.innerHTML = rows.length
    ? rows.join('')
    : `<div class="empty-state">
        <div class="empty-icon">🎯</div>
        <p>Belum ada data pengeluaran bulan ini</p>
        <small>Anggaran membantu Anda mengontrol pengeluaran. Tambah transaksi atau set anggaran per kategori untuk memulai!</small>
        <div class="empty-cta">
          <button class="btn-primary" onclick="openBudgetModal()">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            <span>Set Anggaran</span>
          </button>
        </div>
      </div>`;
}

/* ===== HALAMAN LAPORAN ===== */
function renderReportsPage() {
  const all6 = [];
  for (let i=5; i>=0; i--) {
    let m=currentMonth-i, y=currentYear;
    if (m<0) { m+=12; y--; }
    const t=getMonthTx(m,y);
    all6.push({ income:sumIncome(t), expense:sumExpense(t) });
  }

  const totalInc = all6.reduce((s,x)=>s+x.income,0);
  const totalExp = all6.reduce((s,x)=>s+x.expense,0);
  const totalNet = totalInc - totalExp;
  const rates    = all6.filter(x=>x.income>0).map(x=>Math.round((x.income-x.expense)/x.income*100));
  const avgRate  = rates.length ? Math.round(rates.reduce((s,v)=>s+v,0)/rates.length) : 0;

  document.getElementById('reportsStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Pendapatan 6 Bulan</div>
      <div class="stat-value income-val">${fmtCompact(totalInc)}</div>
      <div class="stat-meta">Total 6 bulan terakhir</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pengeluaran 6 Bulan</div>
      <div class="stat-value expense-val">${fmtCompact(totalExp)}</div>
      <div class="stat-meta">Total 6 bulan terakhir</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Tabungan Bersih</div>
      <div class="stat-value" style="color:${totalNet>=0?'var(--income)':'var(--expense)'}">${fmtCompact(totalNet)}</div>
      <div class="stat-meta">${totalNet>=0?'Surplus':'Defisit'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Rata-rata Tabungan</div>
      <div class="stat-value savings-val">${avgRate}%</div>
      <div class="stat-meta">Rata-rata 6 bulan</div>
    </div>`;

  renderTrendChart();
  renderSavingsChart();
}

function renderTrendChart() {
  const labels=[], incD=[], expD=[];
  for (let i=11; i>=0; i--) {
    let m=currentMonth-i, y=currentYear;
    if (m<0) { m+=12; y--; }
    labels.push(MONTHS[m].slice(0,3)+' \''+String(y).slice(2));
    const t=getMonthTx(m,y);
    incD.push(sumIncome(t));
    expD.push(sumExpense(t));
  }

  chartTrend = destroyChart(chartTrend);
  chartTrend = new Chart(document.getElementById('trendChart'), {
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'Pendapatan', data:incD, backgroundColor:'rgba(0,212,170,0.75)', borderRadius:5, borderSkipped:false },
        { label:'Pengeluaran', data:expD, backgroundColor:'rgba(255,107,107,0.75)', borderRadius:5, borderSkipped:false },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:'#8892a4', usePointStyle:true, pointStyleWidth:8, padding:16 } },
        tooltip:{
          backgroundColor:'#0f1625', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, cornerRadius:10,
          callbacks:{ label: c => ` ${c.dataset.label}: ${fmtCurrency(c.raw)}` }
        }
      },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ maxRotation:45 } },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ callback: v => fmtCompact(v) } }
      }
    }
  });
}

function renderSavingsChart() {
  const labels=[], netD=[];
  for (let i=5; i>=0; i--) {
    let m=currentMonth-i, y=currentYear;
    if (m<0) { m+=12; y--; }
    labels.push(MONTHS[m].slice(0,3));
    const t=getMonthTx(m,y);
    netD.push(sumIncome(t)-sumExpense(t));
  }

  chartSavings = destroyChart(chartSavings);
  chartSavings = new Chart(document.getElementById('savingsChart'), {
    type:'line',
    data:{
      labels,
      datasets:[{
        label:'Tabungan Bersih',
        data:netD,
        borderColor:'#ffd43b', backgroundColor:'rgba(255,212,59,0.08)',
        borderWidth:2.5,
        pointBackgroundColor: netD.map(v => v>=0?'#00d4aa':'#ff6b6b'),
        pointBorderColor:    netD.map(v => v>=0?'#00d4aa':'#ff6b6b'),
        pointRadius:5, pointHoverRadius:8,
        tension:0.4, fill:true
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:'#0f1625', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, cornerRadius:10,
          callbacks:{ label: c => ` Tabungan: ${fmtCurrency(c.raw)}` }
        }
      },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,0.04)' } },
        y:{ grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ callback: v => fmtCompact(v) } }
      }
    }
  });
}

/* ===== GOALS (TARGET TABUNGAN) ===== */
function renderGoalsPage() {
  const listEl  = document.getElementById('goalsList');
  const emptyEl = document.getElementById('goalsEmpty');
  const sumEl   = document.getElementById('goalsSummary');

  if (!goals.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    sumEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';

  // Summary bar
  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved  = goals.reduce((s, g) => s + g.savedAmount, 0);
  const completed   = goals.filter(g => g.savedAmount >= g.targetAmount).length;

  sumEl.innerHTML = `
    <div class="goals-summary-item">
      <span class="gs-label">Tujuan</span>
      <span class="gs-val">${goals.length}</span>
    </div>
    <div class="goals-summary-item">
      <span class="gs-label">Terkumpul</span>
      <span class="gs-val">${fmtCompact(totalSaved)}</span>
    </div>
    <div class="goals-summary-item">
      <span class="gs-label">Total Target</span>
      <span class="gs-val">${fmtCompact(totalTarget)}</span>
    </div>
    <div class="goals-summary-item">
      <span class="gs-label">Tercapai</span>
      <span class="gs-val" style="color:var(--income)">${completed} ✓</span>
    </div>
  `;

  listEl.innerHTML = goals.map(g => {
    const pct       = g.targetAmount > 0 ? Math.min(Math.round(g.savedAmount / g.targetAmount * 100), 100) : 0;
    const remaining = Math.max(g.targetAmount - g.savedAmount, 0);
    const complete  = g.savedAmount >= g.targetAmount;

    let deadlineHtml = '';
    if (g.deadline) {
      const dl    = new Date(g.deadline + 'T00:00:00');
      const today = new Date(); today.setHours(0,0,0,0);
      const days  = Math.ceil((dl - today) / 86400000);
      const dlStr = dl.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
      const cls   = days < 0 ? 'urgent' : days <= 30 ? 'soon' : '';
      const dlTxt = days < 0 ? `Tenggat terlewat (${dlStr})`
                   : days === 0 ? 'Tenggat hari ini!'
                   : days <= 30 ? `${days} hari lagi — ${dlStr}`
                   : `Tenggat: ${dlStr}`;
      deadlineHtml = `<div class="goal-deadline ${cls}">📅 ${dlTxt}</div>`;
    }

    return `
    <div class="goal-card ${complete ? 'completed' : ''}" data-gid="${g.id}">
      <div class="goal-card-accent" style="background:${g.color}"></div>
      <div class="goal-card-top">
        <div class="goal-icon-name">
          <div class="goal-icon" style="background:${g.color}22">${g.icon}</div>
          <div>
            <div class="goal-name">${escHtml(g.name)}</div>
            ${deadlineHtml}
          </div>
        </div>
        <div class="goal-card-actions">
          ${!complete ? `<button class="goal-act-btn deposit" onclick="openDepositModal('${g.id}')">+ Setor</button>` : ''}
          <button class="goal-act-btn" onclick="openGoalModal('${g.id}')">✏️</button>
          <button class="goal-act-btn" onclick="deleteGoal('${g.id}')">🗑️</button>
        </div>
      </div>
      <div class="goal-amounts">
        <span class="goal-saved" style="color:${g.color}">${fmtCompact(g.savedAmount)}</span>
        <span class="goal-target">/ ${fmtCompact(g.targetAmount)}</span>
      </div>
      <div class="goal-progress-wrap">
        <div class="goal-progress-bar">
          <div class="goal-progress-fill" style="width:${pct}%;background:${g.color}"></div>
        </div>
        <div class="goal-progress-meta">
          <span class="goal-pct" style="color:${g.color}">${pct}%</span>
          ${complete
            ? `<span class="goal-complete-badge">✅ Tercapai!</span>`
            : `<span class="goal-remaining">Kurang ${fmtCompact(remaining)}</span>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

/* Goal Modal */
let selectedGoalIcon  = '🎯';
let selectedGoalColor = '#6c63ff';

function openGoalModal(id = null) {
  editingGoalId = id;
  const form = document.getElementById('goalForm');
  form.reset();
  selectedGoalIcon  = '🎯';
  selectedGoalColor = '#6c63ff';

  // Reset icon/color pickers
  document.querySelectorAll('.icon-opt').forEach(b => b.classList.toggle('active', b.dataset.icon === '🎯'));
  document.querySelectorAll('.color-opt').forEach(b => b.classList.toggle('active', b.dataset.color === '#6c63ff'));

  if (id) {
    const g = goals.find(x => x.id === id);
    if (!g) return;
    document.getElementById('goalModalTitle').textContent = 'Edit Tujuan';
    document.getElementById('goalEditId').value           = id;
    document.getElementById('goalName').value             = g.name;
    document.getElementById('goalTarget').value           = g.targetAmount;
    document.getElementById('goalInitial').value          = '';
    document.getElementById('goalDeadline').value         = g.deadline || '';
    selectedGoalIcon  = g.icon;
    selectedGoalColor = g.color;
    document.querySelectorAll('.icon-opt').forEach(b => b.classList.toggle('active', b.dataset.icon === g.icon));
    document.querySelectorAll('.color-opt').forEach(b => b.classList.toggle('active', b.dataset.color === g.color));
  } else {
    document.getElementById('goalModalTitle').textContent = 'Tujuan Baru';
    document.getElementById('goalEditId').value = '';
  }

  document.getElementById('goalModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('goalName').focus(), 120);
}

function closeGoalModal() {
  document.getElementById('goalModalOverlay').classList.remove('open');
  editingGoalId = null;
}

async function saveGoal(e) {
  e.preventDefault();
  const name    = document.getElementById('goalName').value.trim();
  const target  = parseFloat(document.getElementById('goalTarget').value) || 0;
  const initial = parseFloat(document.getElementById('goalInitial').value) || 0;
  const deadline = document.getElementById('goalDeadline').value || null;

  if (!name)    { toast('Masukkan nama tujuan', 'error'); return; }
  if (target < 1) { toast('Masukkan target jumlah yang valid', 'error'); return; }

  if (editingGoalId) {
    const i = goals.findIndex(g => g.id === editingGoalId);
    if (i !== -1) {
      goals[i] = { ...goals[i], name, icon: selectedGoalIcon, color: selectedGoalColor,
                   targetAmount: target, deadline };
    }
    toast('Tujuan diperbarui');
  } else {
    goals.push({
      id: uid(), name, icon: selectedGoalIcon, color: selectedGoalColor,
      targetAmount: target, savedAmount: initial, deadline,
      createdAt: toIso(new Date()),
    });
    toast('Tujuan baru dibuat 🎯');
  }

  await saveData();
  closeGoalModal();
  renderGoalsPage();
}

async function deleteGoal(id) {
  const g = goals.find(x => x.id === id);
  if (!confirm(`Hapus tujuan "${g?.name}"?`)) return;
  goals = goals.filter(x => x.id !== id);
  await saveData();
  toast('Tujuan dihapus', 'info');
  renderGoalsPage();
}

window.openGoalModal  = openGoalModal;
window.deleteGoal     = deleteGoal;
window.openDepositModal = openDepositModal;

/* Deposit Modal */
function openDepositModal(id) {
  depositGoalId = id;
  const g = goals.find(x => x.id === id);
  if (!g) return;

  const pct = g.targetAmount > 0 ? Math.min(Math.round(g.savedAmount / g.targetAmount * 100), 100) : 0;

  document.getElementById('depositModalTitle').textContent = `Setor ke "${g.name}"`;
  document.getElementById('depositLabel').textContent = `Jumlah Setor (Rp) — kurang ${fmtCompact(Math.max(g.targetAmount - g.savedAmount, 0))}`;
  document.getElementById('depositAmount').value = '';
  document.getElementById('depositProgress').innerHTML = `
    <div class="deposit-goal-info">
      <span class="deposit-goal-icon">${g.icon}</span>
      <span class="deposit-goal-name">${escHtml(g.name)}</span>
    </div>
    <div class="deposit-bar">
      <div class="deposit-bar-fill" style="width:${pct}%;background:${g.color}"></div>
    </div>
    <div class="deposit-meta">
      <span>${fmtCompact(g.savedAmount)} terkumpul</span>
      <span>${pct}% dari ${fmtCompact(g.targetAmount)}</span>
    </div>
  `;

  document.getElementById('depositModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('depositAmount').focus(), 120);
}

function closeDepositModal() {
  document.getElementById('depositModalOverlay').classList.remove('open');
  depositGoalId = null;
}

async function doDeposit() {
  const amt = parseFloat(document.getElementById('depositAmount').value) || 0;
  if (amt < 1) { toast('Masukkan jumlah setor yang valid', 'error'); return; }

  const i = goals.findIndex(g => g.id === depositGoalId);
  if (i === -1) return;

  goals[i].savedAmount += amt;
  const g   = goals[i];
  const pct = Math.round(g.savedAmount / g.targetAmount * 100);

  await saveData();
  closeDepositModal();
  renderGoalsPage();

  if (g.savedAmount >= g.targetAmount) {
    toast(`🎉 Tujuan "${g.name}" tercapai! Selamat!`, 'success', 5000);
  } else {
    toast(`${fmtCompact(amt)} disetor ke "${g.name}" (${pct}%)`, 'success');
  }
}

/* ===== VOICE INPUT ===== */
/* ── Voice state ── */
let mediaRecorder  = null;
let audioChunks    = [];
let voiceParsedData = null;
let voiceProcessed  = false;
let voiceHadError   = false;

/* ═══════════════════════════════════════════════════
   NLP ENGINE v2 — Smart transaction parser
   Supports: amounts, categories, dates, types (ID)
═══════════════════════════════════════════════════ */

/* ── Category keyword map (ordered by specificity) ── */
const NLP_CATS = [
  /* === TRANSPORT (before shopping to avoid 'beli bensin' → shopping) === */
  { cat:'transport', keys:[
    'krl','mrt','lrt','transjakarta','busway','commuter','jaklingko','jak lingko',
    'damri','teman bus','bus trans','bus kota',
    'ojek','ojol','gojek','gocar','grab','grab car','grab motor','maxim','indriver','indrive',
    'bensin','bbm','pertamax','pertalite','premium','solar','spbu','pom bensin','isi bensin',
    'isi bbm','beli bensin','beli bbm',
    'tol','jalan tol','bayar tol','parkir','parkiran','bayar parkir',
    'kereta','stasiun','tiket kereta','tiket krl','tiket mrt',
    'angkot','angkutan','bajaj','becak','bemo',
    'taksi','taxi','bluebird','blue bird',
    'transportasi','transport','naik',
    'servis motor','servis mobil','bengkel','tambal ban','cuci motor','cuci mobil','ganti oli',
    'stnk','sim','samsat',
    'pesawat','tiket pesawat','airport','bandara','terminal',
    'kapal','ferry','pelabuhan',
    'e-money','emoney','flazz','brizzi','tapcash',
  ]},

  /* === FOOD & BEVERAGE === */
  { cat:'food', keys:[
    'makan','minum','ngopi','jajan','sarapan','makan siang','makan malam','makan pagi',
    'resto','restoran','warung','warteg','café','kafe','rumah makan',
    'kopi','coffee','espresso','americano','latte','cappuccino','matcha','teh',
    'snack','cemilan','kue','roti','bakery',
    'chagee','starbucks','kopi kenangan','kopi janji jiwa','fore coffee','excelso',
    'mcd','mcdonalds','kfc','burger king','pizzahut','pizza','dominos',
    'nasi','mie','sate','bakso','soto','rendang','gorengan','siomay','batagor',
    'cireng','cilok','gado','ketoprak','lotek',
    'es','boba','milkshake','jus','minuman','smoothie',
    'ayam','bebek','ikan','udang','seafood','cumi','kepiting',
    'steak','burger','sandwich','kebab',
    'indomie','mi instan',
    'dunkin','chatime','gong cha','kokumi','haus','es teh','es jeruk',
    'aqua','air mineral',
    'warteg','padang','sunda','chinese food','thai food','korean food',
    'sushi','ramen','pho','dimsum','dim sum','martabak',
    'breakfast','lunch','dinner','brunch',
    'groceries','bahan makanan','belanja makan','belanja dapur',
    'indomaret','alfamart','alfamidi',  // small convenience → likely food
  ]},

  /* === UTILITIES === */
  { cat:'utilities', keys:[
    'listrik','token listrik','bayar listrik','pln','tagihan listrik',
    'air','pdam','tagihan air','iuran air',
    'pulsa','isi pulsa','beli pulsa','paket data','paket internet','kuota','data',
    'internet','wifi','indihome','biznet','firstmedia','myrepublic','xlhome','iconnet',
    'telkomsel','xl','axis','smartfren','tri','by.u','isat','im3','simpati','loop',
    'top up','topup','reload',
    'gas','isi gas','beli gas','gas lpg','gas melon',
    'tagihan','bayar tagihan',
  ]},

  /* === HEALTH === */
  { cat:'health', keys:[
    'obat','beli obat','apotek','apotik','kimia farma','century','guardian',
    'dokter','klinik','puskesmas','rumah sakit','rs','rsu','rsia','rscm',
    'bpjs','iuran bpjs','bayar bpjs',
    'asuransi kesehatan',
    'periksa','cek kesehatan','medical check','mcu','lab','laboratorium',
    'rontgen','usg','ct scan','mri','vaksin','imunisasi',
    'vitamin','suplemen','multivitamin','minyak kayu putih',
    'promag','panadol','antangin','tolak angin','pocari','oralit',
    'masker','alkohol','plester','betadine','antiseptik',
    'antigen','pcr','rapid test','swab',
    'dokter gigi','klinik gigi','cabut gigi','tambal gigi','behel','scaling',
    'dokter mata','lensa kontak',
    'spa','pijat','massage','refleksi','fisioterapi',
    'psikolog','psikiater','terapi',
  ]},

  /* === HOUSING === */
  { cat:'housing', keys:[
    'sewa','bayar sewa','sewa rumah',
    'kos','kosan','bayar kos','sewa kos','kontrakan','kontrak',
    'apartemen','apartement','sewa apart','bayar apart',
    'kpr','cicilan kpr','cicil rumah','angsuran rumah','dp rumah','uang muka',
    'ipl','maintenance','service charge','biaya pengelolaan',
    'iuran rt','iuran rw','iuran lingkungan','biaya keamanan','satpam',
    'renovasi','cat rumah','perbaikan rumah','tukang','material bangunan',
    'parkir bulanan','parkir apartment',
  ]},

  /* === ENTERTAINMENT === */
  { cat:'entertainment', keys:[
    'bioskop','cinema','cgv','cinepolis','imax','xxi','21','nonton film',
    'netflix','spotify','youtube premium','disney','disney plus','hbo','hbo max',
    'vidio','viu','iqiyi','wetv','mola','prime video','apple tv',
    'game','steam','playstation','xbox','nintendo','mobile legend','ml','ff','free fire',
    'konser','event','festival','tiket konser','tiket event',
    'karaoke','bowling','billiard','futsal',
    'gym','fitness','crossfit','muay thai','yoga','pilates',
    'badminton','renang','golf','tennis','basket','bola',
    'paintball','escape room','lasertag','arcade','timezone','funworld',
    'taman hiburan','wahana','dufan','taman bermain',
    'tiket wisata','wisata','rekreasi','piknik','liburan dalam kota',
    'nongkrong','hangout','main',
  ]},

  /* === SHOPPING === */
  { cat:'shopping', keys:[
    'shopee','tokopedia','lazada','blibli','bukalapak','jd.id','tiktok shop',
    'zalora','sociolla','beauty','kosmetik','skincare','makeup','parfum',
    'baju','kaos','celana','kemeja','dress','jaket','sweater','hoodie','blouse',
    'sepatu','sandal','sneakers','boots',
    'tas','dompet','ransel','koper',
    'jam tangan','kacamata','aksesoris','perhiasan','cincin','kalung','gelang',
    'elektronik','gadget','hp','handphone','laptop','tablet','earphone','headset',
    'charger','kabel','powerbank','mouse','keyboard',
    'furnitur','perabot','dekorasi','lampu','karpet',
    'mainan','action figure',
    'hadiah','kado','souvenir','oleh-oleh',
    'belanja online','belanja',
    'hypermart','carrefour','transmart','hero','giant','superindo','lottemart',
    'shoprite',
  ]},

  /* === SUBSCRIPTIONS === */
  { cat:'subscriptions', keys:[
    'langganan','subscribe','subscription','berlangganan',
    'member','premium','pro','plus',
    'icloud','google one','dropbox','onedrive',
    'notion','figma','canva','adobe','creative cloud',
    'microsoft','office 365','microsoft 365',
    'antivirus','vpn','nordvpn','surfshark',
    'domain','hosting','vps','cloud','server','aws','gcp','azure',
    'annual fee','biaya tahunan','biaya bulanan','tagihan bulanan',
  ]},

  /* === EDUCATION === */
  { cat:'education', keys:[
    'buku','beli buku','buku pelajaran','novel','komik',
    'kursus','les','bimbel','bimbingan belajar','privat',
    'kuliah','spp','ukt','biaya kuliah','uang semester','biaya sekolah',
    'seragam','tas sekolah','alat sekolah','alat tulis',
    'pelatihan','training','seminar','workshop','bootcamp','webinar',
    'udemy','coursera','dicoding','buildwithangga','ruangguru','zenius','quipper',
    'british council','ef english',
    'wisuda','toga',
  ]},

  /* === TRAVEL === */
  { cat:'travel', keys:[
    'liburan','traveling','trip','perjalanan','wisata ke','tour',
    'tiket pesawat','hotel','penginapan','villa','resort',
    'airbnb','booking.com','traveloka','tiket.com','pegipegi','agoda',
    'visa','paspor','biaya visa',
    'backpacker','itinerary',
  ]},

  /* === SALARY / INCOME === */
  { cat:'salary', keys:[
    'gaji','gajian','salary','upah','honor','honorarium',
    'slip gaji','transfer gaji','terima gaji',
  ]},
  { cat:'freelance', keys:[
    'freelance','frilan','proyek','project','klien','client',
    'invoice','bayaran proyek','design fee','coding fee','writing fee',
    'jasa','fee proyek','komisi penjualan','royalti',
  ]},
  { cat:'investment', keys:[
    'investasi','saham','reksa dana','reksadana','obligasi','deposito',
    'emas','logam mulia','kripto','crypto','bitcoin','ethereum',
    'dividen','bunga deposito','bagi hasil','return investasi','cuan saham',
  ]},
  { cat:'bonus', keys:[
    'thr','bonus','insentif','incentive','reward','cashback','cash back',
    'refund','uang kembali','dana kembali','klaim',
  ]},
];

/* Build a flat lookup for speed */
const NLP_LOOKUP = new Map();
NLP_CATS.forEach(({ cat, keys }) => {
  keys.forEach(k => { if (!NLP_LOOKUP.has(k)) NLP_LOOKUP.set(k, cat); });
});

/* ── Type detection ── */
const RE_INCOME  = /\b(gaji|gajian|terima gaji|dapat gaji|cair gaji|transfer masuk|dapat|terima|masuk|bonus|thr|freelance|proyek selesai|jual|cair|dapet|nerima|dikasih|diberi|kiriman|dividen|cashback|refund|investasi cair|untung|cuan|keuntungan)\b/;
const RE_EXPENSE = /\b(beli|bayar|bayarin|ngeluarin|keluar|jajan|belanja|sewa|tagihan|biaya|transfer|kirim uang|ngirim|isi|top.?up|topup|langganan|cicil|kredit|angsuran|dp|parkir|ongkir|charge|iuran|donasi|infaq|sedekah|zakat|servis|tambal|cuci|ganti)\b/;

/* Number words (Bahasa Indonesia) */
const NUM_WORDS = {
  nol:0, satu:1, dua:2, tiga:3, empat:4, lima:5,
  enam:6, tujuh:7, delapan:8, sembilan:9, sepuluh:10,
  sebelas:11, dua belas:12, tiga belas:13, empat belas:14, lima belas:15,
  enam belas:16, tujuh belas:17, delapan belas:18, sembilan belas:19,
  dua puluh:20, tiga puluh:30, empat puluh:40, lima puluh:50,
  enam puluh:60, tujuh puluh:70, delapan puluh:80, sembilan puluh:90,
  seratus:100, dua ratus:200, tiga ratus:300, empat ratus:400, lima ratus:500,
  enam ratus:600, tujuh ratus:700, delapan ratus:800, sembilan ratus:900,
  seribu:1000,
};

function wordsToNumber(text) {
  // Try multi-word patterns first
  for (const [word, val] of Object.entries(NUM_WORDS).sort((a,b) => b[0].length - a[0].length)) {
    if (text.includes(word)) {
      const rest = text.replace(word, '').trim();
      if (!rest) return val;
      // e.g. "dua puluh lima" → 20 + 5 = 25
      const more = wordsToNumber(rest);
      if (more !== null && more < val) return val + more;
    }
  }
  return null;
}

/* ── Amount extractor ── */
function extractAmount(text) {
  const t = text.toLowerCase();

  // "setengah juta / setengah ribu"
  if (/setengah\s*(juta|jt)/.test(t)) return 500_000;
  if (/setengah\s*(ribu|rb)/.test(t))  return 500;

  // "1.5 juta", "1,5jt", "1 5 jt" (space between), "1.5juta"
  let m = t.match(/(\d+)[.,\s](\d+)\s*(juta|jt|jutaan)\b/);
  if (m) return Math.round(parseFloat(`${m[1]}.${m[2]}`) * 1_000_000);

  m = t.match(/(\d+[.,]?\d*)\s*(juta|jt|jutaan)\b/);
  if (m) { const n = parseFloat(m[1].replace(',','.')); if (n>0) return Math.round(n*1_000_000); }

  // miliar
  m = t.match(/(\d+[.,]?\d*)\s*(miliar|milyar)\b/);
  if (m) { const n = parseFloat(m[1].replace(',','.')); if (n>0) return Math.round(n*1_000_000_000); }

  // "1.5 ribu", "15rb", "15 ribu", "1,5rb"
  m = t.match(/(\d+)[.,\s](\d+)\s*(ribu|rb|ribuan)\b/);
  if (m) return Math.round(parseFloat(`${m[1]}.${m[2]}`) * 1_000);

  m = t.match(/(\d+[.,]?\d*)\s*(ribu|rb|ribuan|k)\b/);
  if (m) { const n = parseFloat(m[1].replace(',','.')); if (n>0) return Math.round(n*1_000); }

  // perak / plain rupiah
  m = t.match(/(\d+)\s*(perak|rupiah)\b/);
  if (m) return parseInt(m[1])||0;

  // rp prefix: "rp 15.000", "rp15rb"
  m = t.match(/rp\.?\s*([\d.,]+)\s*(juta|jt|ribu|rb|k)?/);
  if (m) {
    let n = parseFloat(m[1].replace(/[.,]/g,'') ); // strip separators
    if (m[2]) {
      if (/juta|jt/.test(m[2])) n *= 1_000_000;
      else if (/ribu|rb|k/.test(m[2])) n *= 1_000;
    }
    if (n>=100) return Math.round(n);
  }

  // Plain number: "15000", "15.000", "150.000"
  m = t.match(/\b(\d{1,3}(?:[.,]\d{3})+)\b/);
  if (m) { const n = parseInt(m[1].replace(/[.,]/g,'')); if (n>=500) return n; }

  m = t.match(/\b(\d{4,})\b/);
  if (m) { const n = parseInt(m[1]); if (n>=500) return n; }

  // Indonesian word numbers + unit
  const wordAmt = tryWordAmount(t);
  if (wordAmt) return wordAmt;

  return 0;
}

function tryWordAmount(text) {
  // "lima ribu", "dua puluh ribu", "delapan juta", "satu setengah juta"
  const UNITS = [
    { re:/\b([\w\s]+)\s+(miliar|milyar)\b/, mul:1_000_000_000 },
    { re:/\b([\w\s]+)\s+(juta|jt)\b/,      mul:1_000_000 },
    { re:/\b([\w\s]+)\s+(ribu|rb|k)\b/,    mul:1_000 },
    { re:/\b([\w\s]+)\s+(ratus)\b/,         mul:100 },
  ];
  for (const { re, mul } of UNITS) {
    const m = text.match(re);
    if (m) {
      const wordPart = m[1].trim();
      const val = wordsToNumber(wordPart);
      if (val !== null && val > 0) return val * mul;
    }
  }
  return 0;
}

/* ── Category detector ── */
function detectCategory(text) {
  const t = text.toLowerCase();

  // Check multi-word keys first (longest match wins)
  const sorted = [...NLP_LOOKUP.entries()].sort((a,b) => b[0].length - a[0].length);
  for (const [key, cat] of sorted) {
    if (t.includes(key)) return cat;
  }
  return 'other';
}

/* ── Type detector ── */
function detectType(text) {
  const t = text.toLowerCase();
  const isIncome  = RE_INCOME.test(t);
  const isExpense = RE_EXPENSE.test(t);
  if (isIncome && !isExpense) return 'income';
  if (isExpense) return 'expense';
  // Category fallback
  const cat = detectCategory(t);
  if (['salary','freelance','investment','bonus'].includes(cat)) return 'income';
  return 'expense';
}

/* ── Date extractor ── */
function extractDate(text) {
  const t     = text.toLowerCase();
  const today = new Date(); today.setHours(0,0,0,0);
  const off   = n => { const d=new Date(today); d.setDate(d.getDate()+n); return toIso(d); };

  if (/hari ini|tadi|baru saja|barusan/.test(t)) return toIso(today);
  if (/kemarin|kemaren/.test(t))                 return off(-1);
  if (/besok/.test(t))                           return off(+1);
  if (/lusa/.test(t))                            return off(+2);
  if (/2 hari lalu|dua hari lalu/.test(t))       return off(-2);
  if (/3 hari lalu|tiga hari lalu/.test(t))      return off(-3);
  if (/minggu lalu|seminggu lalu/.test(t))       return off(-7);
  if (/bulan lalu/.test(t)) {
    const d=new Date(today); d.setMonth(d.getMonth()-1); return toIso(d);
  }

  const monthNames = 'januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember';
  const monthShort = 'jan|feb|mar|apr|mei|jun|jul|agu|ags|sep|okt|nov|des';
  const re = new RegExp(`(\\d{1,2})\\s*(${monthNames}|${monthShort})(?:\\s+(\\d{4}))?`, 'i');
  const m  = t.match(re);
  if (m) {
    const day = parseInt(m[1]);
    const mn  = m[2].toLowerCase();
    const yr  = m[3] ? parseInt(m[3]) : today.getFullYear();
    const ALL = (monthNames+'|'+monthShort).split('|');
    const idx = ALL.findIndex(x => x === mn);
    const mo  = idx >= 12 ? idx % 12 : idx;
    if (mo >= 0 && day >= 1 && day <= 31)
      return toIso(new Date(yr, mo, Math.min(day, 28)));
  }
  return toIso(today);
}

/* ── Description cleaner ── */
function cleanDescription(raw) {
  let d = raw.toLowerCase();
  // Strip amounts
  d = d.replace(/rp\.?\s*[\d.,]+\s*(juta|jt|ribu|rb|k|miliar)?/gi, '');
  d = d.replace(/\d+[.,]?\d*\s*(juta|jt|jutaan|miliar|milyar|ribu|rb|ribuan|k|perak|rupiah)\b/gi, '');
  d = d.replace(/\b\d{4,}\b/g, '');
  // Strip date words
  d = d.replace(/\d{1,2}\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|ags|sep|okt|nov|des)/gi, '');
  d = d.replace(/\b(hari ini|tadi pagi|tadi siang|tadi sore|tadi malam|kemarin|kemaren|besok|lusa|minggu lalu|bulan lalu|tadi|barusan|baru saja)\b/gi, '');
  // Strip pure action words (only if standalone)
  d = d.replace(/\b(bayar|bayarin|beli|beliin|ngeluarin|keluar|jajan|transfer|kirim uang|ngirim|isi|top.?up|dong|nih|ya|sih|deh|aja)\b/gi, '');
  // Strip connectors
  d = d.replace(/\b(buat|untuk|ke|di|pada|dari|sama|dengan|dan)\s+/gi, ' ');
  d = d.replace(/\s+/g, ' ').trim();
  // Title case
  d = d.replace(/(?:^|\s)\S/g, c => c.toUpperCase()).trim();
  return d || raw.replace(/\s+/g,' ').trim()
              .replace(/(?:^|\s)\S/g,c=>c.toUpperCase()) || 'Tanpa keterangan';
}

/* ── Main parser ── */
function parseVoiceText(raw) {
  if (!raw || !raw.trim()) return null;
  const text = raw.trim();
  const lo   = text.toLowerCase();

  const amount = extractAmount(lo);
  if (!amount || amount <= 0) return null;

  const type        = detectType(lo);
  const category    = detectCategory(lo);
  const date        = extractDate(lo);
  const description = cleanDescription(text);

  return { type, amount, category, description, date, raw: text };
}

/* ── Voice UI ── */
function openVoiceModal() {
  resetVoiceState();
  document.getElementById('voiceModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('voiceTextInput')?.focus(), 120);
}

function closeVoiceModal() {
  voiceProcessed = true; // prevent any pending onend from firing
  voiceHadError  = false;
  stopVoiceRecognition();
  resetVoiceState();
  document.getElementById('voiceModalOverlay').classList.remove('open');
}

function resetVoiceState() {
  document.getElementById('voiceStateIdle').style.display       = '';
  document.getElementById('voiceStateListening').style.display  = 'none';
  document.getElementById('voiceStateProcessing').style.display = 'none';
  document.getElementById('voiceStateResult').style.display     = 'none';
  document.getElementById('voiceStateError').style.display      = 'none';
  document.getElementById('voiceTranscript').textContent        = '';
  document.getElementById('voiceFinalText').textContent         = '';
  voiceParsedData  = null;
  voiceHadError    = false;
  // Keep text input value so user can edit & retry
}

function showVoiceState(state) {
  resetVoiceState();
  const el = document.getElementById('voiceState' + state.charAt(0).toUpperCase() + state.slice(1));
  if (el) el.style.display = '';
}

function startVoiceRecognition() {
  voiceProcessed = false;
  voiceHadError  = false;
  audioChunks    = [];

  if (!navigator.mediaDevices?.getUserMedia) {
    voiceHadError = true;
    showVoiceState('error');
    document.getElementById('voiceErrorMsg').textContent =
      'Browser tidak mendukung perekaman audio. Gunakan Chrome/Edge terbaru.';
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      // Pick best supported format
      const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';

      mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      audioChunks   = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); // release mic
        if (voiceProcessed) return; // user cancelled
        const blob = new Blob(audioChunks, { type: mime });
        await transcribeAudio(blob, mime);
      };

      mediaRecorder.start(250); // slice every 250ms
      showVoiceState('listening');

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (mediaRecorder?.state === 'recording') stopVoiceRecognition();
      }, 30_000);
    })
    .catch(err => {
      voiceHadError = true;
      showVoiceState('error');
      document.getElementById('voiceErrorMsg').textContent =
        err.name === 'NotAllowedError'
          ? 'Izin mikrofon ditolak. Izinkan akses mikrofon di browser.'
          : `Gagal akses mikrofon: ${err.message}`;
    });
}

function stopVoiceRecognition() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    showVoiceState('processing');
    document.getElementById('voiceFinalText').textContent = 'Mengirim audio…';
    mediaRecorder.stop(); // triggers onstop → transcribeAudio
  }
  mediaRecorder = null;
}

async function transcribeAudio(blob, mimeType) {
  showVoiceState('processing');
  document.getElementById('voiceFinalText').textContent = 'Mentranskrip dengan Whisper AI…';
  try {
    // Convert blob to base64
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary  = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const resp = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64, mimeType: mimeType || 'audio/webm' }),
    });

    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);
    if (!result.text?.trim()) throw new Error('Transkripsi kosong — coba bicara lebih jelas.');

    document.getElementById('voiceFinalText').textContent = `"${result.text}"`;
    voiceProcessed = true;
    processVoiceText(result.text.trim());
  } catch (err) {
    voiceHadError = true;
    showVoiceState('error');
    document.getElementById('voiceErrorMsg').textContent = err.message;
  }
}

function processVoiceText(text) {
  showVoiceState('processing');
  document.getElementById('voiceFinalText').textContent = `"${text}"`;

  const parsed = parseVoiceText(text);

  if (!parsed || parsed.amount <= 0) {
    showVoiceState('error');
    document.getElementById('voiceErrorMsg').textContent =
      `Tidak bisa mengenali jumlah uang dari: "${text}". Coba sebutkan nominal dengan jelas, misal "15 ribu" atau "1.5 juta".`;
    return;
  }

  voiceParsedData = parsed;
  showVoiceResult(parsed);
}

function showVoiceResult(p) {
  showVoiceState('result');

  const cat  = CATS[p.category] || CATS.other;
  const date = new Date(p.date + 'T00:00:00');
  const dateStr = date.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  document.getElementById('voiceResultCard').innerHTML = `
    <div class="voice-result-row">
      <span class="voice-result-label">Tipe</span>
      <span class="voice-result-val" style="color:${p.type==='income'?'var(--income)':'var(--expense)'};font-weight:600">
        ${p.type==='income'?'📥 Pendapatan':'📤 Pengeluaran'}
      </span>
    </div>
    <div class="voice-result-row">
      <span class="voice-result-label">Jumlah</span>
      <span class="voice-result-amount ${p.type}">${p.type==='income'?'+':'-'}${fmtCurrency(p.amount)}</span>
    </div>
    <div class="voice-result-row">
      <span class="voice-result-label">Kategori</span>
      <span class="voice-result-val">${cat.icon} ${cat.label}</span>
    </div>
    <div class="voice-result-row">
      <span class="voice-result-label">Deskripsi</span>
      <span class="voice-result-val">${escHtml(p.description)}</span>
    </div>
    <div class="voice-result-row">
      <span class="voice-result-label">Tanggal</span>
      <span class="voice-result-val">📅 ${dateStr}</span>
    </div>
    <div class="voice-result-row" style="font-size:11px;color:var(--text3);border-top-color:var(--border);padding-top:8px">
      🎤 Teks asli: "${escHtml(p.raw)}"
    </div>
  `;
}

async function confirmVoiceTransaction() {
  if (!voiceParsedData) return;

  const p = voiceParsedData;
  transactions.push({
    id: uid(),
    type:        p.type,
    amount:      p.amount,
    description: p.description,
    category:    p.category,
    date:        p.date,
    note:        '',
    accountId:   selectedAccountId || accounts[0]?.id,
  });

  await saveData();
  closeVoiceModal();

  if (p.type === 'expense') checkBudgetAlerts(p.category, p.date);

  refresh();
  toast(`✅ "${p.description}" — ${fmtCurrency(p.amount)} tercatat otomatis!`, 'success', 3500);
}

function openVoiceAsEdit() {
  if (!voiceParsedData) return;
  closeVoiceModal();
  setTimeout(() => {
    openModal();
    document.getElementById('amount').value      = voiceParsedData.amount;
    document.getElementById('description').value = voiceParsedData.description;
    document.getElementById('date').value        = voiceParsedData.date;
    setType(voiceParsedData.type);
    requestAnimationFrame(() => {
      document.getElementById('category').value  = voiceParsedData.category;
      document.getElementById('txAccountId').value = selectedAccountId || accounts[0]?.id || '';
    });
  }, 200);
}

/* ===== EXPORT EXCEL ===== */
function openExportModal() {
  // Default: awal bulan ini s/d hari ini
  const now      = new Date();
  const firstDay = toIso(new Date(currentYear, currentMonth, 1));
  const today    = toIso(now);

  document.getElementById('exportFrom').value = firstDay;
  document.getElementById('exportTo').value   = today;

  // Reset active preset
  document.querySelectorAll('.export-preset-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-preset="thismonth"]')?.classList.add('active');

  updateExportPreview();
  document.getElementById('exportModalOverlay').classList.add('open');
}

function closeExportModal() {
  document.getElementById('exportModalOverlay').classList.remove('open');
}

function updateExportPreview() {
  const from = document.getElementById('exportFrom').value;
  const to   = document.getElementById('exportTo').value;
  const el   = document.getElementById('exportPreview');
  const txt  = document.getElementById('exportPreviewText');

  if (!from || !to) {
    txt.textContent = 'Pilih rentang tanggal';
    el.classList.remove('warn');
    return;
  }

  if (from > to) {
    txt.textContent = 'Tanggal awal tidak boleh lebih besar dari tanggal akhir';
    el.classList.add('warn');
    return;
  }

  el.classList.remove('warn');
  const count = transactions.filter(t => t.date >= from && t.date <= to).length;

  if (count === 0) {
    txt.textContent = 'Tidak ada transaksi pada rentang ini';
    el.classList.add('warn');
  } else {
    const fmtD = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
    txt.textContent = `${count} transaksi  ·  ${fmtD(from)} – ${fmtD(to)}`;
  }
}

function applyExportPreset(preset) {
  const now   = new Date();
  let from, to = toIso(now);

  switch (preset) {
    case 'thismonth':
      from = toIso(new Date(currentYear, currentMonth, 1));
      to   = toIso(new Date(currentYear, currentMonth + 1, 0));
      break;
    case 'lastmonth': {
      const lm = new Date(currentYear, currentMonth - 1, 1);
      from = toIso(lm);
      to   = toIso(new Date(lm.getFullYear(), lm.getMonth() + 1, 0));
      break;
    }
    case 'last3':
      from = toIso(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      break;
    case 'last6':
      from = toIso(new Date(now.getFullYear(), now.getMonth() - 5, 1));
      break;
    case 'thisyear':
      from = toIso(new Date(now.getFullYear(), 0, 1));
      to   = toIso(new Date(now.getFullYear(), 11, 31));
      break;
    case 'all':
      if (!transactions.length) { from = toIso(now); break; }
      const dates = transactions.map(t => t.date).sort();
      from = dates[0];
      to   = dates[dates.length - 1];
      break;
    default: return;
  }

  document.getElementById('exportFrom').value = from;
  document.getElementById('exportTo').value   = to;
  document.querySelectorAll('.export-preset-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.preset === preset)
  );
  updateExportPreview();
}

function doExport() {
  const from = document.getElementById('exportFrom').value;
  const to   = document.getElementById('exportTo').value;

  if (!from || !to) { toast('Pilih rentang tanggal terlebih dahulu', 'error'); return; }
  if (from > to)    { toast('Tanggal awal harus sebelum tanggal akhir', 'error'); return; }

  if (typeof XLSX === 'undefined') {
    toast('Library Excel belum dimuat, coba refresh halaman', 'error');
    return;
  }

  const filtered = [...transactions]
    .filter(t => t.date >= from && t.date <= to)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!filtered.length) {
    toast('Tidak ada transaksi pada rentang tersebut', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();

  /* ── Sheet 1: Transaksi ── */
  const txRows = filtered.map((t, i) => ({
    'No':           i + 1,
    'Tanggal':      t.date,
    'Keterangan':   t.description,
    'Kategori':     CATS[t.category]?.label || t.category,
    'Tipe':         t.type === 'income' ? 'Pendapatan' : 'Pengeluaran',
    'Jumlah (Rp)':  t.amount,
    'Catatan':      t.note || '',
  }));

  const ws1 = XLSX.utils.json_to_sheet(txRows);
  ws1['!cols'] = [
    { wch:5 }, { wch:14 }, { wch:30 },
    { wch:20 }, { wch:13 }, { wch:18 }, { wch:24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Transaksi');

  /* ── Sheet 2: Ringkasan Bulanan ── */
  const monthMap = {};
  filtered.forEach(t => {
    const d   = new Date(t.date + 'T00:00:00');
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (!monthMap[key]) monthMap[key] = { inc:0, exp:0 };
    if (t.type === 'income') monthMap[key].inc += t.amount;
    else                     monthMap[key].exp += t.amount;
  });

  const sumRows = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [y, m] = key.split('-');
      const net    = v.inc - v.exp;
      return {
        'Bulan':                `${MONTHS[parseInt(m) - 1]} ${y}`,
        'Pendapatan (Rp)':      v.inc,
        'Pengeluaran (Rp)':     v.exp,
        'Tabungan Bersih (Rp)': net,
        'Tingkat Tabungan':     v.inc > 0 ? `${Math.round(net / v.inc * 100)}%` : '0%',
      };
    });

  const ws2 = XLSX.utils.json_to_sheet(sumRows);
  ws2['!cols'] = [{ wch:16 },{ wch:20 },{ wch:20 },{ wch:24 },{ wch:16 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Ringkasan Bulanan');

  /* ── Sheet 3: Per Kategori ── */
  const catMap = {};
  filtered.forEach(t => {
    if (!catMap[t.category]) catMap[t.category] = {
      label: CATS[t.category]?.label || t.category,
      tipe:  t.type === 'income' ? 'Pendapatan' : 'Pengeluaran',
      total:0, count:0,
    };
    catMap[t.category].total += t.amount;
    catMap[t.category].count++;
  });

  const catRows = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .map((v, i) => ({
      'No':               i + 1,
      'Kategori':         v.label,
      'Tipe':             v.tipe,
      'Total (Rp)':       v.total,
      'Jml Transaksi':    v.count,
      'Rata-rata (Rp)':   Math.round(v.total / v.count),
    }));

  const ws3 = XLSX.utils.json_to_sheet(catRows);
  ws3['!cols'] = [{ wch:5 },{ wch:22 },{ wch:13 },{ wch:18 },{ wch:14 },{ wch:18 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Per Kategori');

  /* ── Download ── */
  const now      = new Date();
  const tag      = `${from}_sd_${to}`;
  const fileName = `FinanceFlow_${tag}.xlsx`;
  XLSX.writeFile(wb, fileName);
  closeExportModal();
  toast(`✅ "${fileName}" berhasil diunduh`);
}

window.exportToExcel  = openExportModal;   // tombol header panggil modal, bukan langsung export

/* ===== PRINT / PDF ===== */
function printReport() {
  // Update print header meta
  const meta = document.getElementById('printHeaderMeta');
  if (meta) {
    const now    = new Date();
    const accName = selectedAccountId
      ? (accounts.find(a => a.id === selectedAccountId)?.name || 'Semua Akun')
      : 'Semua Akun';
    meta.innerHTML = `
      <div>${MONTHS[currentMonth]} ${currentYear}</div>
      <div>${accName}</div>
      <div>Dicetak: ${now.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' })}</div>
    `;
  }

  // Pastikan di halaman dashboard sebelum print
  if (currentPage !== 'dashboard') navigateTo('dashboard');

  setTimeout(() => window.print(), 200);
}

/* ===== MODAL ===== */
function openModal(id=null) {
  editingId = id;
  const form = document.getElementById('transactionForm');
  form.reset();
  document.getElementById('date').value = toIso(new Date());

  if (id) {
    const t = transactions.find(x=>x.id===id);
    if (!t) return;
    document.getElementById('modalTitle').textContent   = 'Edit Transaksi';
    document.getElementById('editId').value             = id;
    document.getElementById('amount').value             = t.amount;
    document.getElementById('description').value        = t.description;
    document.getElementById('date').value               = t.date;
    document.getElementById('note').value               = t.note||'';
    document.getElementById('recurring').checked        = !!t.recurring;
    setType(t.type);
    requestAnimationFrame(() => {
      document.getElementById('category').value  = t.category;
      document.getElementById('txAccountId').value = t.accountId || accounts[0]?.id || '';
    });
  } else {
    document.getElementById('modalTitle').textContent = 'Tambah Transaksi';
    document.getElementById('recurring').checked = false;
    // Default ke akun yang sedang difilter, atau akun pertama
    requestAnimationFrame(() => {
      const sel = document.getElementById('txAccountId');
      sel.value = selectedAccountId || accounts[0]?.id || '';
    });
    setType('expense');
  }

  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('amount').focus(), 120);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

function setType(type) {
  selectedType = type;
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type===type);
  });
  const cats = type==='income' ? INCOME_CATS() : EXPENSE_CATS();
  const sel  = document.getElementById('category');
  sel.innerHTML = cats.map(k => `<option value="${k}">${CATS[k]?.icon||'📦'} ${CATS[k]?.label||k}</option>`).join('');
}

/* ===== DEBT TRACKER ===== */
let debtsFilter  = 'all';
let editingDebtId = null;
let selectedDebtType = 'owe';

function renderDebtsPage() {
  const listEl  = document.getElementById('debtsList');
  const emptyEl = document.getElementById('debtsEmpty');
  const sumEl   = document.getElementById('debtsSummary');

  let filtered = [...debts];
  if (debtsFilter === 'owe')    filtered = filtered.filter(d => d.dtype === 'owe');
  if (debtsFilter === 'lend')   filtered = filtered.filter(d => d.dtype === 'lend');
  if (debtsFilter === 'active') filtered = filtered.filter(d => !d.paid);

  filtered.sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    return new Date(b.date) - new Date(a.date);
  });

  // Summary
  const totalOwe  = debts.filter(d => d.dtype === 'owe'  && !d.paid).reduce((s,d) => s+d.amount, 0);
  const totalLend = debts.filter(d => d.dtype === 'lend' && !d.paid).reduce((s,d) => s+d.amount, 0);
  const overdueCount = debts.filter(d => !d.paid && d.due && new Date(d.due+'T00:00:00') < new Date()).length;

  sumEl.innerHTML = `
    <div class="debts-summary-item">
      <span class="ds-label">Saya Berutang</span>
      <span class="ds-val" style="color:var(--expense)">${fmtCompact(totalOwe)}</span>
    </div>
    <div class="debts-summary-item">
      <span class="ds-label">Piutang Saya</span>
      <span class="ds-val" style="color:var(--income)">${fmtCompact(totalLend)}</span>
    </div>
    <div class="debts-summary-item">
      <span class="ds-label">Saldo Bersih</span>
      <span class="ds-val" style="color:${totalLend-totalOwe>=0?'var(--income)':'var(--expense)'}">${fmtCompact(totalLend-totalOwe)}</span>
    </div>
    ${overdueCount ? `<div class="debts-summary-item"><span class="ds-label">Jatuh Tempo</span><span class="ds-val" style="color:var(--expense)">${overdueCount} item</span></div>` : ''}
  `;

  if (!filtered.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const today = new Date(); today.setHours(0,0,0,0);

  listEl.innerHTML = filtered.map(d => {
    let dueHtml = '';
    if (d.due) {
      const dl   = new Date(d.due + 'T00:00:00');
      const days = Math.ceil((dl - today) / 86400000);
      const dlStr = dl.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
      const cls   = !d.paid && days < 0 ? 'overdue' : !d.paid && days <= 7 ? 'soon' : '';
      const txt   = days < 0 ? `Jatuh tempo ${dlStr} (telat ${Math.abs(days)} hari)` : days === 0 ? 'Jatuh tempo hari ini!' : `Jatuh tempo: ${dlStr}`;
      dueHtml = `<span class="debt-due ${cls}">📅 ${txt}</span>`;
    }

    return `
    <div class="debt-item ${d.paid?'paid':''}">
      <span class="debt-type-badge ${d.dtype}">${d.dtype==='owe'?'Utang':'Piutang'}</span>
      <div class="debt-info">
        <div class="debt-person">
          ${escHtml(d.person)}
          ${d.paid ? '<span class="debt-paid-badge">✅ Lunas</span>' : ''}
        </div>
        <div class="debt-meta">
          ${d.description ? `<span>${escHtml(d.description)}</span>` : ''}
          <span>${new Date(d.date+'T00:00:00').toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</span>
          ${dueHtml}
        </div>
      </div>
      <div class="debt-amount ${d.dtype}">${d.dtype==='owe'?'-':'+'}${fmtCurrency(d.amount)}</div>
      <div class="debt-actions">
        ${!d.paid ? `<button class="debt-pay-btn" onclick="markDebtPaid('${d.id}')">✓ Lunas</button>` : ''}
        <button class="goal-act-btn" onclick="openDebtModal('${d.id}')">✏️</button>
        <button class="goal-act-btn" onclick="deleteDebt('${d.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

window.openDebtModal = openDebtModal;
window.markDebtPaid  = markDebtPaid;
window.deleteDebt    = deleteDebt;

function openDebtModal(id = null) {
  editingDebtId = id;
  const form = document.getElementById('debtForm');
  form.reset();
  document.getElementById('debtDate').value = toIso(new Date());
  selectedDebtType = 'owe';
  document.querySelectorAll('[data-dtype]').forEach(b => b.classList.toggle('active', b.dataset.dtype === 'owe'));
  document.getElementById('debtPersonLabel').textContent = 'Berutang ke siapa?';

  if (id) {
    const d = debts.find(x => x.id === id);
    if (!d) return;
    document.getElementById('debtModalTitle').textContent = 'Edit Catatan';
    document.getElementById('debtEditId').value    = id;
    document.getElementById('debtPerson').value    = d.person;
    document.getElementById('debtAmount').value    = d.amount;
    document.getElementById('debtDate').value      = d.date;
    document.getElementById('debtDesc').value      = d.description || '';
    document.getElementById('debtDue').value       = d.due || '';
    selectedDebtType = d.dtype;
    document.querySelectorAll('[data-dtype]').forEach(b => b.classList.toggle('active', b.dataset.dtype === d.dtype));
    document.getElementById('debtPersonLabel').textContent = d.dtype === 'owe' ? 'Berutang ke siapa?' : 'Meminjamkan ke siapa?';
  } else {
    document.getElementById('debtModalTitle').textContent = 'Catat Utang/Piutang';
    document.getElementById('debtEditId').value = '';
  }

  document.getElementById('debtModalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('debtPerson').focus(), 120);
}

function closeDebtModal() {
  document.getElementById('debtModalOverlay').classList.remove('open');
  editingDebtId = null;
}

async function saveDebt(e) {
  e.preventDefault();
  const person = document.getElementById('debtPerson').value.trim();
  const amount = parseFloat(document.getElementById('debtAmount').value) || 0;
  const date   = document.getElementById('debtDate').value;
  const desc   = document.getElementById('debtDesc').value.trim();
  const due    = document.getElementById('debtDue').value || null;

  if (!person) { toast('Masukkan nama orang/instansi', 'error'); return; }
  if (amount < 1) { toast('Masukkan jumlah yang valid', 'error'); return; }

  if (editingDebtId) {
    const i = debts.findIndex(d => d.id === editingDebtId);
    if (i !== -1) debts[i] = { ...debts[i], person, amount, date, description: desc, due, dtype: selectedDebtType };
    toast('Catatan diperbarui');
  } else {
    debts.push({ id: uid(), person, amount, date, description: desc, due, dtype: selectedDebtType, paid: false, createdAt: toIso(new Date()) });
    toast(selectedDebtType === 'owe' ? '📝 Utang dicatat' : '📝 Piutang dicatat');
  }

  await saveData();
  closeDebtModal();
  renderDebtsPage();
}

async function markDebtPaid(id) {
  const i = debts.findIndex(d => d.id === id);
  if (i === -1) return;
  debts[i].paid    = true;
  debts[i].paidAt  = toIso(new Date());
  await saveData();
  renderDebtsPage();
  toast(`✅ "${debts[i].person}" ditandai lunas!`, 'success', 4000);
}

async function deleteDebt(id) {
  const d = debts.find(x => x.id === id);
  if (!confirm(`Hapus catatan utang/piutang ke "${d?.person}"?`)) return;
  debts = debts.filter(x => x.id !== id);
  await saveData();
  toast('Catatan dihapus', 'info');
  renderDebtsPage();
}

/* ===== MANAJEMEN KATEGORI ===== */
let editingCatKey = null;

function openCatsModal() {
  renderCatsList();
  document.getElementById('catFormWrap').style.display = 'none';
  editingCatKey = null;
  document.getElementById('catsModalOverlay').classList.add('open');
}

function closeCatsModal() {
  document.getElementById('catsModalOverlay').classList.remove('open');
  editingCatKey = null;
}

function renderCatsList() {
  const el = document.getElementById('catsListEl');
  const typeLabel = { expense:'Pengeluaran', income:'Pendapatan', both:'Keduanya' };

  // Base cats (read-only)
  const baseHTML = Object.entries(BASE_CATS).map(([k, v]) => `
    <div class="cat-list-item">
      <span class="cat-list-icon" style="background:${v.color}22;color:${v.color}">${v.icon}</span>
      <span class="cat-list-name">${v.label}</span>
      <span class="cat-list-type">${typeLabel[v.type]||v.type}</span>
      <span class="cat-list-badge">Bawaan</span>
    </div>`).join('');

  // Custom cats
  const customHTML = Object.entries(customCats).map(([k, v]) => `
    <div class="cat-list-item">
      <span class="cat-list-icon" style="background:${v.color}22;color:${v.color}">${v.icon}</span>
      <span class="cat-list-name">${escHtml(v.label)}</span>
      <span class="cat-list-type">${typeLabel[v.type]||v.type}</span>
      <div style="display:flex;gap:4px;margin-left:auto">
        <button class="goal-act-btn" onclick="openCatForm('${k}')">✏️</button>
        <button class="goal-act-btn" onclick="deleteCustomCat('${k}')">🗑️</button>
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="cats-section-label">Kategori Bawaan (${Object.keys(BASE_CATS).length})</div>
    <div class="cats-list-wrap base">${baseHTML}</div>
    ${Object.keys(customCats).length ? `
      <div class="cats-section-label" style="margin-top:12px">Kategori Kustom (${Object.keys(customCats).length})</div>
      <div class="cats-list-wrap">${customHTML}</div>
    ` : ''}
  `;
}

window.openCatForm    = openCatForm;
window.deleteCustomCat = deleteCustomCat;

function openCatForm(key = null) {
  editingCatKey = key;
  const wrap = document.getElementById('catFormWrap');
  wrap.style.display = '';

  if (key && customCats[key]) {
    const c = customCats[key];
    document.getElementById('catFormTitle').textContent = 'Edit Kategori';
    document.getElementById('catName').value  = c.label;
    document.getElementById('catIcon').value  = c.icon;
    document.getElementById('catColor').value = c.color;
    document.getElementById('catType').value  = c.type;
  } else {
    document.getElementById('catFormTitle').textContent = 'Kategori Baru';
    document.getElementById('catName').value  = '';
    document.getElementById('catIcon').value  = '📦';
    document.getElementById('catColor').value = '#636e72';
    document.getElementById('catType').value  = 'expense';
    editingCatKey = null;
  }

  document.getElementById('catName').focus();
}

async function saveCustomCat() {
  const name  = document.getElementById('catName').value.trim();
  const icon  = document.getElementById('catIcon').value.trim() || '📦';
  const color = document.getElementById('catColor').value;
  const type  = document.getElementById('catType').value;

  if (!name) { toast('Masukkan nama kategori', 'error'); return; }

  if (editingCatKey) {
    customCats[editingCatKey] = { label: name, icon, color, type };
    toast('Kategori diperbarui');
  } else {
    // Generate slug key from name
    const key = 'cat_' + name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now().toString(36);
    customCats[key] = { label: name, icon, color, type };
    toast('Kategori baru ditambahkan 🏷️');
  }

  rebuildCats();
  await saveData();
  setType(selectedType); // refresh category dropdown
  document.getElementById('catFormWrap').style.display = 'none';
  renderCatsList();
  editingCatKey = null;
}

async function deleteCustomCat(key) {
  const c = customCats[key];
  const txCount = transactions.filter(t => t.category === key).length;
  if (!confirm(`Hapus kategori "${c?.label}"?\n${txCount > 0 ? `${txCount} transaksi akan pindah ke "Lainnya".` : ''}`)) return;

  if (txCount > 0) {
    transactions.forEach(t => { if (t.category === key) t.category = 'other'; });
  }

  delete customCats[key];
  if (budgets[key]) delete budgets[key];

  rebuildCats();
  await saveData();
  setType(selectedType);
  renderCatsList();
  toast('Kategori dihapus', 'info');
}

/* ===== ACCOUNTS ===== */
function getAccountBalance(accId) {
  const acc = accounts.find(a => a.id === accId);
  if (!acc) return 0;
  const txs = transactions.filter(t => (t.accountId || accounts[0]?.id) === accId);
  return (acc.initialBalance || 0)
       + txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
       - txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
}

function getTotalBalance() {
  return accounts.reduce((s, a) => s + getAccountBalance(a.id), 0);
}

function renderAccountsBar() {
  const el = document.getElementById('accountsBar');
  if (!el) return;
  if (accounts.length <= 1 && !accounts[0]?.initialBalance) { el.innerHTML = ''; return; }

  el.innerHTML = accounts.map(a => {
    const bal = getAccountBalance(a.id);
    const isActive = selectedAccountId === a.id;
    return `
    <button class="acc-chip ${isActive ? 'active' : ''}" data-accid="${a.id}">
      <span>${a.icon}</span>
      <span class="acc-chip-name">${escHtml(a.name)}</span>
      <span class="acc-chip-bal" style="color:${a.color}">${fmtCompact(bal)}</span>
    </button>`;
  }).join('') + `
    <button class="acc-chip ${selectedAccountId===null?'active':''}" data-accid="all">
      <span>📊</span>
      <span class="acc-chip-name">Semua</span>
      <span class="acc-chip-bal">${fmtCompact(getTotalBalance())}</span>
    </button>
    <button class="acc-chip acc-chip-manage" id="manageAccountsBtn" title="Kelola Akun">⚙️</button>
  `;

  el.querySelectorAll('[data-accid]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'manageAccountsBtn') return;
      const val = btn.dataset.accid;
      selectedAccountId = val === 'all' ? null : val;
      renderAccountsBar();
      refresh();
    });
  });

  const manageBtn = document.getElementById('manageAccountsBtn');
  if (manageBtn) manageBtn.addEventListener('click', openAccountsModal);
}

function populateAccountSelect() {
  const sel = document.getElementById('txAccountId');
  if (!sel) return;
  sel.innerHTML = accounts.map(a =>
    `<option value="${a.id}">${a.icon} ${a.label || a.name}</option>`
  ).join('');
}

/* Accounts CRUD Modal */
function openAccountsModal() {
  renderAccountsList();
  document.getElementById('accountsModalOverlay').classList.add('open');
}

function closeAccountsModal() {
  document.getElementById('accountsModalOverlay').classList.remove('open');
  document.getElementById('accFormWrap').style.display = 'none';
  editingAccId = null;
}

function renderAccountsList() {
  const el = document.getElementById('accountsListEl');
  el.innerHTML = accounts.map(a => {
    const bal = getAccountBalance(a.id);
    return `
    <div class="acc-list-item">
      <div class="acc-list-icon" style="background:${a.color}22;border-color:${a.color}44">${a.icon}</div>
      <div class="acc-list-info">
        <div class="acc-list-name">${escHtml(a.name)}</div>
        <div class="acc-list-type">${a.type === 'bank' ? 'Bank' : a.type === 'ewallet' ? 'E-Wallet' : 'Tunai'}</div>
      </div>
      <div class="acc-list-bal" style="color:${a.color}">${fmtCompact(bal)}</div>
      <div class="acc-list-actions">
        <button class="goal-act-btn" onclick="openAccForm('${a.id}')">✏️</button>
        ${accounts.length > 1 ? `<button class="goal-act-btn" onclick="deleteAccount('${a.id}')">🗑️</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window.openAccForm    = openAccForm;
window.deleteAccount  = deleteAccount;

function openAccForm(id = null) {
  editingAccId = id;
  const wrap = document.getElementById('accFormWrap');
  wrap.style.display = '';

  if (id) {
    const a = accounts.find(x => x.id === id);
    if (!a) return;
    document.getElementById('accFormTitle').textContent  = 'Edit Akun';
    document.getElementById('accName').value             = a.name;
    document.getElementById('accIcon').value             = a.icon;
    document.getElementById('accColor').value            = a.color;
    document.getElementById('accType').value             = a.type;
    document.getElementById('accInitial').value          = a.initialBalance || 0;
  } else {
    document.getElementById('accFormTitle').textContent = 'Akun Baru';
    document.getElementById('accName').value    = '';
    document.getElementById('accIcon').value    = '💳';
    document.getElementById('accColor').value   = '#6c63ff';
    document.getElementById('accType').value    = 'bank';
    document.getElementById('accInitial').value = 0;
  }

  wrap.querySelector('#accName').focus();
}

async function saveAccount() {
  const name    = document.getElementById('accName').value.trim();
  const icon    = document.getElementById('accIcon').value.trim() || '💳';
  const color   = document.getElementById('accColor').value;
  const type    = document.getElementById('accType').value;
  const initial = parseFloat(document.getElementById('accInitial').value) || 0;

  if (!name) { toast('Masukkan nama akun', 'error'); return; }

  if (editingAccId) {
    const i = accounts.findIndex(a => a.id === editingAccId);
    if (i !== -1) accounts[i] = { ...accounts[i], name, icon, color, type, initialBalance: initial };
    toast('Akun diperbarui');
  } else {
    accounts.push({ id: uid(), name, icon, color, type, initialBalance: initial });
    toast('Akun baru ditambahkan');
  }

  await saveData();
  renderAccountsList();
  renderAccountsBar();
  populateAccountSelect();
  document.getElementById('accFormWrap').style.display = 'none';
  editingAccId = null;
}

async function deleteAccount(id) {
  if (accounts.length <= 1) { toast('Minimal 1 akun harus ada', 'error'); return; }
  const a = accounts.find(x => x.id === id);
  const txCount = transactions.filter(t => (t.accountId || accounts[0]?.id) === id).length;
  if (!confirm(`Hapus akun "${a?.name}"?\n${txCount} transaksi akan dipindah ke akun pertama.`)) return;

  // Move transactions to first remaining account
  const fallback = accounts.find(x => x.id !== id);
  transactions.forEach(t => {
    if ((t.accountId || accounts[0]?.id) === id) t.accountId = fallback?.id;
  });

  accounts = accounts.filter(x => x.id !== id);
  if (selectedAccountId === id) selectedAccountId = null;

  await saveData();
  renderAccountsList();
  renderAccountsBar();
  populateAccountSelect();
  toast('Akun dihapus', 'info');
}

/* ===== IMPORT CSV ===== */
let importParsed = []; // rows yang siap diimport

function openImportModal() {
  importParsed = [];
  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('doImportBtn').style.display = 'none';
  document.getElementById('csvFileInput').value = '';
  document.getElementById('importModalOverlay').classList.add('open');
}

function closeImportModal() {
  document.getElementById('importModalOverlay').classList.remove('open');
  importParsed = [];
}

function downloadTemplate() {
  const header = 'tanggal,keterangan,kategori,tipe,jumlah\n';
  const rows = [
    `${toIso(new Date())},Gaji Bulanan,salary,income,8500000`,
    `${toIso(new Date())},Makan Siang,food,expense,45000`,
    `${toIso(new Date())},Bensin,transport,expense,150000`,
  ].join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'template_financeflow.csv';
  a.click(); URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return [];

  // Deteksi header
  const firstLower = lines[0].toLowerCase();
  const hasHeader  = firstLower.includes('tanggal') || firstLower.includes('date') ||
                     firstLower.includes('keterangan') || firstLower.includes('jumlah');
  const dataLines  = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, idx) => {
    // Simple CSV split (handles quoted fields)
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());

    const [rawDate, desc, rawCat, rawType, rawAmt] = cols;

    // Validate date
    const dateMatch = (rawDate||'').match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    let date = null;
    if (dateMatch) date = `${dateMatch[1]}-${pad(dateMatch[2])}-${pad(dateMatch[3])}`;

    // Amount — strip non-numeric except dot/comma
    const amtStr = (rawAmt||'').replace(/[^\d.,]/g, '').replace(',', '.');
    const amount = parseFloat(amtStr) || 0;

    // Type mapping
    const typeRaw = (rawType||'').toLowerCase().trim();
    const type = typeRaw.includes('income') || typeRaw.includes('pendapatan') || typeRaw.includes('masuk')
               ? 'income' : 'expense';

    // Category matching
    const catRaw = (rawCat||'').toLowerCase().trim();
    let category = 'other';
    for (const [k, v] of Object.entries(CATS)) {
      if (catRaw === k || v.label.toLowerCase() === catRaw) { category = k; break; }
    }

    const errors = [];
    if (!date)     errors.push('tanggal tidak valid');
    if (amount<=0) errors.push('jumlah tidak valid');
    if (!desc?.trim()) errors.push('keterangan kosong');

    return {
      _row: idx + (hasHeader ? 2 : 1),
      date, description: (desc||'').trim(), category, type, amount,
      _errors: errors,
      _status: errors.length ? 'err' : 'ok',
    };
  }).filter(r => r.description || r.amount); // skip totally blank rows
}

function renderImportPreview(rows) {
  const ok   = rows.filter(r => r._status === 'ok');
  const errs = rows.filter(r => r._status === 'err');

  document.getElementById('importPreviewHeader').innerHTML = `
    <span>Ditemukan <strong>${rows.length}</strong> baris</span>
    <span class="import-stat ok">✓ ${ok.length} siap import</span>
    ${errs.length ? `<span class="import-stat err">✗ ${errs.length} error (dilewati)</span>` : ''}
  `;

  document.getElementById('importPreviewTable').innerHTML = `
    <thead><tr>
      <th>#</th><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Tipe</th><th>Jumlah</th><th>Status</th>
    </tr></thead>
    <tbody>
    ${rows.map(r => `
      <tr class="row-${r._status}">
        <td>${r._row}</td>
        <td>${r.date||'—'}</td>
        <td>${escHtml(r.description||'—')}</td>
        <td>${CATS[r.category]?.icon||''} ${CATS[r.category]?.label||r.category}</td>
        <td class="${r.type==='income'?'badge-income':'badge-expense'}">${r.type==='income'?'Pendapatan':'Pengeluaran'}</td>
        <td>${r.amount>0?fmtCurrency(r.amount):'—'}</td>
        <td>${r._status==='ok'?'<span style="color:var(--income)">✓</span>':`<span class="badge-err" title="${r._errors.join(', ')}">✗ ${r._errors[0]}</span>`}</td>
      </tr>`).join('')}
    </tbody>
  `;

  document.getElementById('importPreviewFooter').textContent =
    ok.length ? `${ok.length} transaksi akan ditambahkan ke data Anda` : 'Tidak ada baris yang bisa diimport';

  document.getElementById('doImportBtn').style.display = ok.length ? '' : 'none';
  document.getElementById('doImportBtnText').textContent = `Import ${ok.length} Transaksi`;

  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = '';
}

function handleCSVFile(file) {
  if (!file || !file.name.endsWith('.csv')) {
    toast('Pilih file .csv yang valid', 'error'); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast('File terlalu besar (max 5MB)', 'error'); return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSV(e.target.result);
    if (!rows.length) { toast('File CSV kosong atau format tidak dikenali', 'error'); return; }
    importParsed = rows;
    renderImportPreview(rows);
  };
  reader.readAsText(file, 'UTF-8');
}

async function doImport() {
  const toAdd = importParsed.filter(r => r._status === 'ok');
  if (!toAdd.length) return;

  toAdd.forEach(r => {
    transactions.push({
      id: uid(), type: r.type, amount: r.amount,
      description: r.description, category: r.category,
      date: r.date, note: '',
    });
  });

  await saveData();
  closeImportModal();
  refresh();
  toast(`✅ ${toAdd.length} transaksi berhasil diimport`, 'success', 4000);
}

/* ===== TRANSAKSI BERULANG ===== */
/**
 * Cari semua transaksi recurring, lalu auto-generate untuk bulan yang
 * belum punya salinannya. Hanya generate ke bulan sekarang atau sebelumnya
 * (tidak ke masa depan). Menambahkan flag `autoGenerated: true` + `recurringParentId`.
 */
async function generateRecurringTx() {
  const templates = transactions.filter(t => t.recurring && !t.autoGenerated);
  if (!templates.length) return;

  const now = new Date();
  let added = 0;

  templates.forEach(tmpl => {
    const origin = new Date(tmpl.date + 'T00:00:00');

    // Generate dari bulan berikutnya setelah origin sampai bulan sekarang
    let m = origin.getMonth() + 1;
    let y = origin.getFullYear();
    if (m > 11) { m = 0; y++; }

    while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) {
      // Cek apakah bulan ini sudah ada salinan
      const exists = transactions.some(t =>
        t.autoGenerated && t.recurringParentId === tmpl.id &&
        new Date(t.date + 'T00:00:00').getMonth()    === m &&
        new Date(t.date + 'T00:00:00').getFullYear() === y
      );

      if (!exists) {
        const day = Math.min(origin.getDate(), new Date(y, m+1, 0).getDate());
        transactions.push({
          id:                uid(),
          type:              tmpl.type,
          amount:            tmpl.amount,
          description:       tmpl.description,
          category:          tmpl.category,
          date:              toIso(new Date(y, m, day)),
          note:              tmpl.note || '',
          recurring:         false,
          autoGenerated:     true,
          recurringParentId: tmpl.id,
        });
        added++;
      }

      m++;
      if (m > 11) { m = 0; y++; }
    }
  });

  if (added > 0) {
    await saveData();
    toast(`🔁 ${added} transaksi berulang ditambahkan otomatis`, 'info', 4000);
  }
}

/* ===== BUDGET ALERT ===== */
function checkBudgetAlerts(category, txDate) {
  const limit = budgets[category];
  if (!limit) return;

  // Cek pengeluaran kategori ini di bulan transaksi yang baru disimpan
  const d = new Date((txDate || toIso(new Date())) + 'T00:00:00');
  const m = d.getMonth(), y = d.getFullYear();
  const monthTxs = transactions.filter(t => {
    const td = new Date(t.date + 'T00:00:00');
    return td.getMonth() === m && td.getFullYear() === y;
  });

  const spent = monthTxs
    .filter(t => t.type === 'expense' && t.category === category)
    .reduce((s, t) => s + t.amount, 0);

  const pct  = spent / limit * 100;
  const cat  = CATS[category];
  const name = cat?.label || category;

  if (pct >= 100) {
    toast(`Anggaran ${name} melewati batas! ${fmtCompact(spent)} / ${fmtCompact(limit)}`, 'error', 4500);
  } else if (pct >= 80) {
    toast(`Anggaran ${name} sudah ${Math.round(pct)}% — tersisa ${fmtCompact(limit - spent)}`, 'warn', 4000);
  }
}

/* ===== CRUD ===== */
async function saveTx(data) {
  if (editingId) {
    const i = transactions.findIndex(t=>t.id===editingId);
    if (i!==-1) transactions[i] = { ...transactions[i], ...data };
    toast('Transaksi diperbarui');
  } else {
    transactions.push({ id:uid(), ...data });
    toast('Transaksi ditambahkan');
  }
  await saveData();
  // Cek budget alert setelah data tersimpan
  if (data.type === 'expense') checkBudgetAlerts(data.category, data.date);
  refresh();
}

async function deleteTx(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  transactions = transactions.filter(t=>t.id!==id);
  await saveData();
  toast('Transaksi dihapus','info');
  refresh();
}

window.openModal = openModal;
window.deleteTx  = deleteTx;

/* ===== NAVIGASI ===== */
const PAGE_META = {
  dashboard:    ['Dasbor',     'Ringkasan keuangan Anda'],
  transactions: ['Transaksi',  'Semua transaksi bulan ini'],
  budget:       ['Anggaran',   'Batas & progres pengeluaran bulanan'],
  debts:        ['Utang & Piutang', 'Kelola pinjaman & tagihan'],
  goals:        ['Tujuan',     'Target tabungan & pencapaian finansial'],
  reports:      ['Laporan',    'Wawasan & tren keuangan'],
};

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(page+'Page').classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
  const [title, sub] = PAGE_META[page]||['',''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;
  refresh();
}

function refresh() {
  switch(currentPage) {
    case 'dashboard':    renderDashboard();         break;
    case 'transactions': renderTransactionsPage();  break;
    case 'budget':       renderBudgetPage();        break;
    case 'debts':        renderDebtsPage();         break;
    case 'goals':        renderGoalsPage();         break;
    case 'reports':      renderReportsPage();       break;
  }
}

/* ===== MODAL ANGGARAN ===== */
function openBudgetModal() {
  document.getElementById('budgetForm').innerHTML = EXPENSE_CATS().map(k => `
    <div class="budget-input-row">
      <div class="budget-input-label">${CATS[k].icon} ${CATS[k].label}</div>
      <input type="number" min="0" step="10000" placeholder="0"
             value="${budgets[k]||''}" data-cat="${k}">
    </div>
  `).join('');
  document.getElementById('budgetModalOverlay').classList.add('open');
}

function closeBudgetModal() {
  document.getElementById('budgetModalOverlay').classList.remove('open');
}

async function saveBudgets() {
  document.querySelectorAll('#budgetForm input').forEach(inp => {
    const cat = inp.dataset.cat;
    const val = parseFloat(inp.value)||0;
    if (val>0) budgets[cat]=val; else delete budgets[cat];
  });
  await saveData();
  closeBudgetModal();
  renderBudgetPage();
  toast('Anggaran disimpan');
}

/* ===== AUTH + DRIVE ===== */
let currentUser = null;

async function checkAuth() {
  try {
    const res = await fetch('/auth/me');
    currentUser = res.ok ? await res.json() : null;
  } catch { currentUser = null; }
}

function showLoginOverlay(show) {
  const el = document.getElementById('loginOverlay');
  if (!el) return;
  el.style.display = show ? 'flex' : 'none';

  // Check URL params for setup/error hints
  const params = new URLSearchParams(location.search);
  const note   = document.getElementById('loginNote');
  if (note) {
    if (params.has('setup'))      note.textContent = '⚠️ Google OAuth belum dikonfigurasi. Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di file .env';
    else if (params.has('auth_error')) note.textContent = '❌ Login gagal. Coba lagi.';
    else note.textContent = '';
  }
}

function updateUserUI() {
  if (!currentUser) return;
  const nameEl    = document.getElementById('userName');
  const emailEl   = document.getElementById('userEmail');
  const photoEl   = document.getElementById('userPhoto');
  const fallbackEl = document.getElementById('userAvatarFallback');
  if (nameEl)  nameEl.textContent  = currentUser.name  || 'Pengguna';
  if (emailEl) emailEl.textContent = currentUser.email || '';
  if (photoEl && currentUser.picture) {
    photoEl.src = currentUser.picture;
    photoEl.style.display = 'block';
    if (fallbackEl) fallbackEl.style.display = 'none';
  }
}

async function driveBackup() {
  const btn = document.getElementById('driveBackupBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/drive/backup', { method:'POST' });
    const data = await res.json();
    if (data.ok) toast('✅ Backup ke Google Drive berhasil!', 'success');
    else toast(`❌ Backup gagal: ${data.error}`, 'error');
  } catch { toast('❌ Backup gagal — cek koneksi', 'error'); }
  finally { if (btn) btn.disabled = false; }
}

async function driveRestore() {
  if (!confirm('Restore data dari Google Drive? Data lokal saat ini akan diganti.')) return;
  const btn = document.getElementById('driveRestoreBtn');
  if (btn) btn.disabled = true;
  try {
    const res  = await fetch('/api/drive/restore');
    const data = await res.json();
    if (!data.found) { toast('Tidak ada backup di Google Drive', 'error'); return; }
    const { transactions:t, budgets:b, goals:g, accounts:a, customCats:cc, debts:d } = data.data || {};
    if (Array.isArray(t)) {
      transactions = t; budgets = b||{}; goals = g||[];
      accounts = (a?.length) ? a : DEFAULT_ACCOUNTS;
      customCats = cc||{}; debts = d||[];
      rebuildCats();
      await saveData();
      refresh();
      toast(`✅ Restore berhasil — ${t.length} transaksi dipulihkan`, 'success');
    }
  } catch { toast('❌ Restore gagal', 'error'); }
  finally { if (btn) btn.disabled = false; }
}

/* ===== INIT ===== */
async function init() {
  /* Auth check */
  await checkAuth();

  /* Show login overlay if not authenticated */
  if (!currentUser) {
    showLoading(false);   // hide loading spinner
    showLoginOverlay(true);
    return; // stop here — app not initialized until logged in
  }
  showLoginOverlay(false);
  updateUserUI();

  /* Auth-aware 401 handling in loadData */

  /* Tema */
  const savedTheme = localStorage.getItem(LS_THEME) || 'dark';
  applyTheme(savedTheme);

  /* Load data */
  await loadData();

  /* UX: Welcome banner, help modal, arrow keys, pulse removal */
  initWelcomeBanner();
  initHelpModal();
  initArrowKeys();
  initPulseRemoval();

  /* Navigasi bulan */
  document.getElementById('prevMonth').addEventListener('click', () => {
    currentMonth--; if(currentMonth<0){ currentMonth=11; currentYear--; }
    updateMonthLabel(); refresh();
  });
  document.getElementById('nextMonth').addEventListener('click', async () => {
    currentMonth++; if(currentMonth>11){ currentMonth=0; currentYear++; }
    updateMonthLabel();
    await generateRecurringTx();
    refresh();
  });

  /* Sidebar nav */
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.page);
      if (window.innerWidth<=768) document.getElementById('sidebar').classList.remove('open');
    });
  });

  /* Tombol tambah */
  document.getElementById('btnAdd').addEventListener('click', () => openModal());

  /* Lihat semua */
  document.getElementById('viewAllBtn').addEventListener('click', () => navigateTo('transactions'));

  /* Tutup modal */
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target===e.currentTarget) closeModal();
  });

  /* Tab tipe */
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });

  /* Submit form */
  document.getElementById('transactionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const amt  = parseFloat(document.getElementById('amount').value);
    if (!amt||amt<=0) { toast('Masukkan jumlah yang valid','error'); return; }
    const desc = document.getElementById('description').value.trim();
    if (!desc)  { toast('Masukkan keterangan transaksi','error'); return; }
    await saveTx({
      type:        selectedType,
      amount:      amt,
      description: desc,
      category:    document.getElementById('category').value,
      date:        document.getElementById('date').value,
      note:        document.getElementById('note').value.trim(),
      recurring:   document.getElementById('recurring').checked,
      accountId:   document.getElementById('txAccountId').value || accounts[0]?.id,
    });
    closeModal();
  });

  /* Filter transaksi */
  ['searchInput','typeFilter','categoryFilter'].forEach(id => {
    document.getElementById(id).addEventListener('input',  renderTransactionsPage);
    document.getElementById(id).addEventListener('change', renderTransactionsPage);
  });
  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('searchInput').value='';
    document.getElementById('typeFilter').value='';
    document.getElementById('categoryFilter').value='';
    renderTransactionsPage();
  });

  /* Isi dropdown kategori filter */
  function refreshCatFilter() {
    const catFilter = document.getElementById('categoryFilter');
    const cur = catFilter.value;
    catFilter.innerHTML = '<option value="">Semua Kategori</option>';
    Object.entries(CATS).forEach(([k,v]) => {
      const o = document.createElement('option');
      o.value=k; o.textContent=`${v.icon} ${v.label}`;
      catFilter.appendChild(o);
    });
    catFilter.value = cur;
  }
  refreshCatFilter();

  /* Modal anggaran */
  document.getElementById('setBudgetBtn').addEventListener('click', openBudgetModal);
  document.getElementById('budgetModalClose').addEventListener('click', closeBudgetModal);
  document.getElementById('cancelBudgetBtn').addEventListener('click', closeBudgetModal);
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudgets);
  document.getElementById('budgetModalOverlay').addEventListener('click', e => {
    if (e.target===e.currentTarget) closeBudgetModal();
  });

  /* Print */
  document.getElementById('printBtn').addEventListener('click', printReport);

  /* Voice / Catat Cepat */
  document.getElementById('voiceBtn').addEventListener('click', openVoiceModal);
  document.getElementById('voiceModalClose').addEventListener('click', closeVoiceModal);
  document.getElementById('voiceModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeVoiceModal();
  });

  // Text input submit
  function submitVoiceText() {
    const val = document.getElementById('voiceTextInput').value.trim();
    if (!val) { document.getElementById('voiceTextInput').focus(); return; }
    processVoiceText(val);
  }
  document.getElementById('voiceTextSubmitBtn').addEventListener('click', submitVoiceText);
  document.getElementById('voiceTextInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitVoiceText(); }
  });

  // Quick chips
  document.querySelectorAll('.voice-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('voiceTextInput').value = chip.dataset.text;
      document.getElementById('voiceTextInput').focus();
    });
  });

  // Mic (secondary)
  document.getElementById('voiceStartBtn').addEventListener('click', startVoiceRecognition);
  document.getElementById('voiceStopBtn').addEventListener('click', () => {
    voiceProcessed = true;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop(); mediaRecorder = null;
    }
    resetVoiceState();
  });
  document.getElementById('voiceConfirmBtn').addEventListener('click', confirmVoiceTransaction);
  document.getElementById('voiceEditBtn').addEventListener('click', openVoiceAsEdit);
  document.getElementById('voiceRetryBtn').addEventListener('click', resetVoiceState);
  document.getElementById('voiceRetryErrBtn').addEventListener('click', () => {
    resetVoiceState();
    setTimeout(() => document.getElementById('voiceTextInput')?.focus(), 50);
  });

  /* Import CSV */
  document.getElementById('importHeaderBtn').addEventListener('click', openImportModal);
  document.getElementById('importModalClose').addEventListener('click', closeImportModal);
  document.getElementById('cancelImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('importModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeImportModal();
  });
  document.getElementById('doImportBtn').addEventListener('click', doImport);
  document.getElementById('downloadTemplateBtn').addEventListener('click', downloadTemplate);

  // File input
  document.getElementById('csvFileInput').addEventListener('change', e => {
    handleCSVFile(e.target.files[0]);
  });

  // Drag & drop
  const dz = document.getElementById('importDropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('dragover');
    handleCSVFile(e.dataTransfer.files[0]);
  });
  dz.addEventListener('click', e => {
    if (!e.target.classList.contains('import-browse-link'))
      document.getElementById('csvFileInput').click();
  });

  /* Export Excel */
  document.getElementById('exportHeaderBtn').addEventListener('click', openExportModal);
  document.getElementById('exportModalClose').addEventListener('click', closeExportModal);
  document.getElementById('cancelExportBtn').addEventListener('click', closeExportModal);
  document.getElementById('doExportBtn').addEventListener('click', doExport);
  document.getElementById('exportModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeExportModal();
  });
  document.getElementById('exportFrom').addEventListener('change', () => {
    document.querySelectorAll('.export-preset-btn').forEach(b => b.classList.remove('active'));
    updateExportPreview();
  });
  document.getElementById('exportTo').addEventListener('change', () => {
    document.querySelectorAll('.export-preset-btn').forEach(b => b.classList.remove('active'));
    updateExportPreview();
  });
  document.querySelectorAll('.export-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => applyExportPreset(btn.dataset.preset));
  });

  /* Drive backup / restore / logout */
  document.getElementById('driveBackupBtn')?.addEventListener('click', driveBackup);
  document.getElementById('driveRestoreBtn')?.addEventListener('click', driveRestore);
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (confirm('Keluar dari FinanceFlow?')) location.href = '/auth/logout';
  });

  /* Toggle tema */
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  /* Menu mobile */
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  /* Debt Tracker */
  document.getElementById('addDebtBtn').addEventListener('click', () => openDebtModal());
  document.getElementById('debtModalClose').addEventListener('click', closeDebtModal);
  document.getElementById('cancelDebtBtn').addEventListener('click', closeDebtModal);
  document.getElementById('debtModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDebtModal();
  });
  document.getElementById('debtForm').addEventListener('submit', saveDebt);

  // Debt type tabs
  document.querySelectorAll('[data-dtype]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDebtType = btn.dataset.dtype;
      document.querySelectorAll('[data-dtype]').forEach(b => b.classList.toggle('active', b.dataset.dtype === selectedDebtType));
      document.getElementById('debtPersonLabel').textContent =
        selectedDebtType === 'owe' ? 'Berutang ke siapa?' : 'Meminjamkan ke siapa?';
    });
  });

  // Debts filter tabs
  document.querySelectorAll('.debts-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      debtsFilter = btn.dataset.filter;
      document.querySelectorAll('.debts-tab').forEach(b => b.classList.toggle('active', b.dataset.filter === debtsFilter));
      renderDebtsPage();
    });
  });

  /* Categories Management */
  document.getElementById('manageCatsBtn').addEventListener('click', openCatsModal);
  document.getElementById('catsModalClose').addEventListener('click', closeCatsModal);
  document.getElementById('catsModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeCatsModal();
  });
  document.getElementById('addCatBtn').addEventListener('click', () => openCatForm());
  document.getElementById('cancelCatFormBtn').addEventListener('click', () => {
    document.getElementById('catFormWrap').style.display = 'none';
    editingCatKey = null;
  });
  document.getElementById('saveCatBtn').addEventListener('click', saveCustomCat);

  /* Accounts */
  populateAccountSelect();
  renderAccountsBar();
  document.getElementById('accountsModalClose').addEventListener('click', closeAccountsModal);
  document.getElementById('accountsModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAccountsModal();
  });
  document.getElementById('addAccBtn').addEventListener('click', () => openAccForm());
  document.getElementById('cancelAccFormBtn').addEventListener('click', () => {
    document.getElementById('accFormWrap').style.display = 'none';
    editingAccId = null;
  });
  document.getElementById('saveAccBtn').addEventListener('click', saveAccount);

  /* Goals */
  document.getElementById('addGoalBtn').addEventListener('click', () => openGoalModal());
  document.getElementById('goalModalClose').addEventListener('click', closeGoalModal);
  document.getElementById('cancelGoalBtn').addEventListener('click', closeGoalModal);
  document.getElementById('goalModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeGoalModal();
  });
  document.getElementById('goalForm').addEventListener('submit', saveGoal);

  // Icon picker
  document.getElementById('iconPicker').addEventListener('click', e => {
    const btn = e.target.closest('.icon-opt');
    if (!btn) return;
    document.querySelectorAll('.icon-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGoalIcon = btn.dataset.icon;
  });

  // Color picker
  document.getElementById('colorPicker').addEventListener('click', e => {
    const btn = e.target.closest('.color-opt');
    if (!btn) return;
    document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGoalColor = btn.dataset.color;
  });

  /* Deposit */
  document.getElementById('depositModalClose').addEventListener('click', closeDepositModal);
  document.getElementById('cancelDepositBtn').addEventListener('click', closeDepositModal);
  document.getElementById('depositModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeDepositModal();
  });
  document.getElementById('doDepositBtn').addEventListener('click', doDeposit);
  document.getElementById('depositAmount').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doDeposit(); }
  });

  /* Keyboard */
  document.addEventListener('keydown', e => {
    if (e.key==='Escape') {
      closeModal(); closeBudgetModal(); closeExportModal(); closeGoalModal();
      closeDepositModal(); closeImportModal(); closeAccountsModal(); closeCatsModal();
      closeDebtModal(); closeVoiceModal();
      document.getElementById('helpModalOverlay').classList.remove('open');
      // Also skip tour
      const tourOverlay = document.getElementById('tourOverlay');
      if (tourOverlay.style.display !== 'none') {
        tourOverlay.style.display = 'none';
        tourOverlay.classList.remove('dim');
        document.getElementById('tourHighlight').style.display = 'none';
        document.getElementById('tourTooltip').style.opacity = '0';
        localStorage.setItem(LS_ONBOARDED, '1');
        document.getElementById('btnAdd')?.classList.remove('pulse-cta');
      }
    }
    if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); openModal(); }
  });

  updateMonthLabel();
  await generateRecurringTx();
  renderDashboard();

  /* Onboarding — run after dashboard rendered, if first visit */
  if (!localStorage.getItem(LS_ONBOARDED)) {
    setTimeout(() => runOnboarding(), 600);
  } else {
    // Still remove pulse after delay even if not onboarding
    setTimeout(() => document.getElementById('btnAdd')?.classList.remove('pulse-cta'), 10000);
  }
}

/* ===== ONBOARDING TOUR ===== */
const LS_ONBOARDED = 'ff_onboarded';

function runOnboarding() {
  const steps = [
    {
      target: '.sidebar',
      text: 'Selamat datang di <strong>FinanceFlow</strong>! 🎉<br>Ini pusat kendali keuangan pribadi Anda. Yuk, kita lihat sekilas fitur-fiturnya!',
      position: 'right',
    },
    {
      target: '#btnAdd',
      text: '<strong>Tambah Transaksi</strong> — Di sinilah semuanya dimulai.<br>Catat setiap pemasukan dan pengeluaran Anda di sini. Bisa juga pakai pintasan <kbd>Ctrl+K</kbd>.',
      position: 'bottom',
    },
    {
      target: '.month-nav',
      text: '<strong>Navigasi Bulan</strong> — Gunakan tombol panah untuk melihat data keuangan bulan sebelumnya atau berikutnya. Bisa juga pakai ← → di keyboard.',
      position: 'bottom',
    },
    {
      target: '.stats-grid',
      text: '<strong>Kartu Statistik</strong> — Pantau saldo total, pendapatan, pengeluaran, dan tingkat tabungan Anda dalam sekejap.',
      position: 'bottom',
    },
    {
      target: '.sidebar-nav',
      text: '<strong>Menu Navigasi</strong> — Akses semua fitur: Transaksi, Anggaran, Utang, Tujuan, dan Laporan. Klik untuk berpindah halaman.',
      position: 'right',
    },
  ];

  let currentStep = 0;
  const overlay   = document.getElementById('tourOverlay');
  const highlight = document.getElementById('tourHighlight');
  const tooltip   = document.getElementById('tourTooltip');
  const txt       = document.getElementById('tourText');
  const count     = document.getElementById('tourStepCount');
  const prevBtn   = document.getElementById('tourPrev');
  const nextBtn   = document.getElementById('tourNext');
  const skipBtn   = document.getElementById('tourSkip');

  function positionElements() {
    const step      = steps[currentStep];
    const targetEl  = document.querySelector(step.target);
    if (!targetEl) { nextStep(); return; }

    const tr = targetEl.getBoundingClientRect();
    overlay.classList.add('dim');

    // Highlight
    highlight.style.display = '';
    highlight.style.top     = (tr.top  - 6) + 'px';
    highlight.style.left    = (tr.left - 6) + 'px';
    highlight.style.width   = (tr.width  + 12) + 'px';
    highlight.style.height  = (tr.height + 12) + 'px';

    // Tooltip position
    let tTop, tLeft;
    const gap = 16;

    switch (step.position) {
      case 'right':
        tTop  = tr.top;
        tLeft = tr.right + gap;
        break;
      case 'left':
        tTop  = tr.top;
        tLeft = tr.left - 360;
        break;
      case 'bottom':
        tTop  = tr.bottom + gap;
        tLeft = tr.left;
        break;
      case 'top':
        tTop  = tr.top - 180;
        tLeft = tr.left;
        break;
      default:
        tTop  = tr.bottom + gap;
        tLeft = tr.left;
    }

    // Clamp to viewport
    tTop  = Math.max(16, Math.min(tTop,  window.innerHeight - 200));
    tLeft = Math.max(16, Math.min(tLeft, window.innerWidth  - 360));

    tooltip.style.top  = tTop + 'px';
    tooltip.style.left = tLeft + 'px';
    tooltip.style.opacity = '1';
  }

  function updateContent() {
    const step = steps[currentStep];
    count.textContent = `Langkah ${currentStep + 1} dari ${steps.length}`;
    txt.innerHTML     = step.text;
    prevBtn.style.display = currentStep === 0 ? 'none' : '';
    nextBtn.textContent = currentStep === steps.length - 1 ? 'Selesai ✨' : 'Lanjut';
  }

  function nextStep() {
    currentStep++;
    if (currentStep >= steps.length) {
      finishTour();
      return;
    }
    updateContent();
    positionElements();
  }

  function prevStepFn() {
    currentStep--;
    if (currentStep < 0) currentStep = 0;
    updateContent();
    positionElements();
  }

  function finishTour() {
    overlay.style.display = 'none';
    overlay.classList.remove('dim');
    highlight.style.display = 'none';
    tooltip.style.opacity = '0';
    localStorage.setItem(LS_ONBOARDED, '1');
    // Remove pulse after tour
    document.getElementById('btnAdd')?.classList.remove('pulse-cta');
  }

  // Event listeners
  nextBtn.onclick   = nextStep;
  prevBtn.onclick   = prevStepFn;
  skipBtn.onclick   = finishTour;
  overlay.onclick   = null; // don't close on overlay click

  // Show
  overlay.style.display = '';
  highlight.style.display = 'none';
  tooltip.style.opacity  = '0';
  currentStep = 0;
  updateContent();
  requestAnimationFrame(() => {
    requestAnimationFrame(positionElements);
  });
}

/* ===== WELCOME BANNER ===== */
const LS_BANNER = 'ff_banner_dismissed';

function initWelcomeBanner() {
  const visited = parseInt(localStorage.getItem('ff_visit_count') || '0', 10);
  localStorage.setItem('ff_visit_count', String(visited + 1));

  const dismissed = localStorage.getItem(LS_BANNER);
  if (dismissed) return;

  const banner  = document.getElementById('welcomeBanner');
  const closeBtn = document.getElementById('welcomeBannerClose');
  if (!banner || !closeBtn) return;

  // Show banner for first 3 visits
  if (visited < 3) {
    banner.style.display = '';
  } else {
    banner.style.display = 'none';
  }

  closeBtn.addEventListener('click', () => {
    banner.style.animation = 'fadeOutToast 0.3s ease forwards';
    setTimeout(() => { banner.style.display = 'none'; }, 300);
    localStorage.setItem(LS_BANNER, '1');
  });
}

/* ===== HELP MODAL ===== */
function initHelpModal() {
  document.getElementById('helpBtn').addEventListener('click', () => {
    document.getElementById('helpModalOverlay').classList.add('open');
  });
  document.getElementById('helpModalClose').addEventListener('click', () => {
    document.getElementById('helpModalOverlay').classList.remove('open');
  });
  document.getElementById('helpModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget)
      document.getElementById('helpModalOverlay').classList.remove('open');
  });
}

/* ===== ENHANCED EMPTY STATES ===== */
function renderEmptyState(container, options) {
  const { icon, title, description, ctaText, ctaAction } = options;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <p>${title}</p>
      <small>${description}</small>
      ${ctaText ? `<div class="empty-cta"><button class="btn-primary" onclick="${ctaAction}">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        <span>${ctaText}</span>
      </button></div>` : ''}
    </div>`;
}

/* ===== IMPROVED BUDGET EMOJI ===== */
function getBudgetEmoji(pct) {
  if (pct >= 100) return '🔴';
  if (pct >= 80)  return '⚠️';
  if (pct >= 50)  return '🟡';
  return '';
}

/* ===== ARROW KEY NAVIGATION ===== */
function initArrowKeys() {
  document.addEventListener('keydown', e => {
    // Skip if inside input/textarea/select
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Skip if modal is open
    if (document.querySelector('.modal-overlay.open')) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      updateMonthLabel();
      refresh();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      updateMonthLabel();
      generateRecurringTx().then(() => refresh());
    }
  });
}

/* ===== REMOVE PULSE AFTER DELAY ===== */
function initPulseRemoval() {
  setTimeout(() => {
    document.getElementById('btnAdd')?.classList.remove('pulse-cta');
  }, 10000); // 10 seconds
}

document.addEventListener('DOMContentLoaded', init);
