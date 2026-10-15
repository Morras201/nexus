const STORAGE_KEY = 'loan_book_data_v4';
const PREF_KEY = 'loan_book_prefs_v5';
let INTEREST_RATE = 0.40; // fallback default — overwritten by loadAppData() from prefs.preferredInterestRate

function genId(){ return 'loan-' + Date.now() + '-' + Math.floor(Math.random()*100000); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function calcCycle(principal){
  const interest = Math.round(principal * INTEREST_RATE);
  return { interest, totalDue: principal + interest };
}

function seedLoans(){
  const customers = ['Ava Thompson','Liam Chen','Noah Patel','Mia Rodriguez','Ethan Kim','Sofia Rossi','Lucas Muller','Zoe Okafor','Isabella Silva','Mason Clarke','Aria Nakamura','Jack Wilson','Grace Osei','Ryan Novak','Chloe Dubois'];
  const loans = [];
  const today = new Date();
  const daysAgo = n => { const d=new Date(today); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };

  customers.forEach((name, idx) => {
    const principal = Math.round((Math.random()*1500+500)/100)*100;
    const outcome = idx % 5; // vary outcomes across customers

    const randDaysLate = () => { const r = Math.random();
      if(r<0.35) return -Math.ceil(Math.random()*5);       // paid early
      if(r<0.6) return 0;                                   // paid on time
      if(r<0.85) return Math.ceil(Math.random()*7);         // minor late
      return 8+Math.ceil(Math.random()*10);                 // major late
    };

    if(outcome === 0){
      // single active new loan
      const {interest, totalDue} = calcCycle(principal);
      loans.push({ id:genId(), customer:name, principal, interest, totalDue, cycleType:'new', rolloverCount:0, status:'active', date:daysAgo(Math.floor(Math.random()*6)), notes:'', parentId:null, password:'demo1234' });
    } else if(outcome === 1){
      // settled loan (paid in full, closed)
      const {interest, totalDue} = calcCycle(principal);
      loans.push({ id:genId(), customer:name, principal, interest, totalDue, cycleType:'new', rolloverCount:0, status:'settled', date:daysAgo(Math.floor(Math.random()*9)+1), notes:'', parentId:null, daysLate:randDaysLate(), password:'demo1234' });
    } else if(outcome === 2){
      // defaulted loan
      const {interest, totalDue} = calcCycle(principal);
      loans.push({ id:genId(), customer:name, principal, interest, totalDue, cycleType:'new', rolloverCount:0, status:'defaulted', date:daysAgo(Math.floor(Math.random()*9)+1), notes:'Missed payment', parentId:null, password:'demo1234' });
    } else {
      // rollover chain: first cycle rolled, second cycle active (or settled on final)
      const {interest, totalDue} = calcCycle(principal);
      const firstId = genId();
      loans.push({ id:firstId, customer:name, principal, interest, totalDue, cycleType:'new', rolloverCount:0, status:'rolled', date:daysAgo(9), notes:'', parentId:null, daysLate:randDaysLate(), password:'demo1234' });
      const finalStatus = outcome === 3 ? 'active' : 'settled';
      loans.push({ id:genId(), customer:name, principal, interest, totalDue, cycleType:'rollover', rolloverCount:1, status:finalStatus, date:daysAgo(Math.floor(Math.random()*5)), notes:'', parentId:firstId, password:'demo1234', ...(finalStatus==='settled'?{daysLate:randDaysLate()}:{}) });
    }
  });
  return loans;
}

/* ---------- persistence: SQLite via local server (replaces localStorage) ---------- */
const API_BASE = '';

function defaultPrefs(){
  return {
    view:'table', client:'all',
    stats:{ active:true, rolled:true, settled:true, defaulted:true, netProfit:true, outstanding:true },
    sort:{ field:'date', dir:'desc' },
    maxRollovers: 3,
    salesPeriod:'week', clientsMetric:'principal', donutMetric:'count',
    // Dashboard reporting period (hero total, stat cards, disbursements chart)
    dateRange:{ mode:'thisMonth', start:'', end:'' },
    notifyEmail:'',
    autoLockMins: 0,
    backupHistory: [],
    notifyEvents: { newLoan:true, dueSoon:true, overdue:true, docUploaded:false },
    // Automated Monthly Reminders (Loans page)
    // Reminders still waiting to be sent by hand (survives reloads).
    reminderQueue: { items: [], savedAt: '' },
    autoReminders: {}
  };
}

// Single-owner site: no per-account sessions. If the host sets APP_PASSWORD
// the browser's own Basic Auth prompt guards the whole site (see server.js);
// fetch() sends those credentials automatically on same-origin calls.
function authFetch(url, opts){ return fetch(url, opts || {}); }

async function loadLoansFromServer(){
  const res = await authFetch(API_BASE + '/api/loans');
  if(!res.ok) throw new Error('Could not load loans from server');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadPrefsFromServer(){
  const res = await authFetch(API_BASE + '/api/prefs');
  if(!res.ok) throw new Error('Could not load preferences from server');
  const data = await res.json();
  return data || defaultPrefs();
}

async function loadExpensesFromServer(){
  const res = await authFetch(API_BASE + '/api/expenses');
  if(!res.ok) throw new Error('Could not load expenses from server');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function loadCustomerProfilesFromServer(){
  const res = await authFetch(API_BASE + '/api/customer-profiles');
  if(!res.ok) throw new Error('Could not load customer profiles from server');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function saveLoans(l){
  return authFetch(API_BASE + '/api/loans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(l)
  }).then(res => {
    if(!res.ok) throw new Error('Server responded with ' + res.status);
    return true;
  }).catch(err => { console.error('Failed to save loans to database:', err); return false; });
}
function savePrefs(){
  return authFetch(API_BASE + '/api/prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs)
  }).catch(err => console.error('Failed to save preferences to database:', err));
}
function saveExpenses(e){
  return authFetch(API_BASE + '/api/expenses', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(e)
  }).catch(err => console.error('Failed to save expenses to database:', err));
}
function saveCustomerProfiles(p){
  return authFetch(API_BASE + '/api/customer-profiles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p)
  }).catch(err => console.error('Failed to save customer profiles to database:', err));
}

let loans = [];
let expenses = [];
let customerProfiles = []; // optional personal info, one row per customer name
let prefs = defaultPrefs();
let editingId = null;

function getCustomerProfile(name){
  return customerProfiles.find(p=>p.customer===name) || { customer:name, customerId:'', phone:'', email:'', address:'', province:'', idNumber:'', notes:'', createdAt:'' };
}
function upsertCustomerProfile(profile){
  const i = customerProfiles.findIndex(p=>p.customer===profile.customer);
  if(i>=0) customerProfiles[i] = { ...customerProfiles[i], ...profile }; else customerProfiles.push(profile);
  return saveCustomerProfiles(customerProfiles);
}
// A customer can only be borrowed against once every field below is
// filled in — partial/legacy records (e.g. customers that only exist
// because of an old loan) show as "incomplete" until finished.
function isCustomerComplete(p){
  return !!(p && p.customer && p.customer.trim() && p.phone && p.phone.trim() &&
    p.email && p.email.trim() && p.idNumber && p.idNumber.trim() && p.address && p.address.trim());
}
function completeCustomerNames(){
  return customerProfiles.filter(isCustomerComplete).map(p=>p.customer).sort((a,b)=>a.localeCompare(b));
}
function allCustomerNames(){
  return Array.from(new Set([...customerProfiles.map(p=>p.customer), ...loans.map(l=>l.customer)]));
}
function genCustomerId(){
  const chars = '0123456789';
  let out = '';
  for(let i=0;i<10;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
// We only lend to South African customers, so every stored phone number
// is normalised to +27 form regardless of how it was typed in
// (0821234567, 27821234567, 082 123 4567, etc.).
function formatZAPhone(raw){
  const v = (raw || '').trim();
  if(!v) return v;
  const digits = v.replace(/\D/g, '');
  if(!digits) return v;
  if(v.startsWith('+27')) return '+27' + digits.slice(2);
  if(digits.startsWith('27')) return '+' + digits;
  if(digits.startsWith('0')) return '+27' + digits.slice(1);
  return '+27' + digits;
}

// Display-only: spaces out a stored +27XXXXXXXXX number into
// "+27 12 345 6789" so it's easier to read at a glance. Never used for
// the editable input — only for read-only display.
function displayPhone(raw){
  const v = (raw || '').trim();
  if(!v) return v;
  const m = v.match(/^\+27(\d{2})(\d{3})(\d{4})$/);
  if(m) return `+27 ${m[1]} ${m[2]} ${m[3]}`;
  // Fallback for anything that doesn't match the expected shape —
  // just space out digit runs in groups of 3-4 from the start.
  return v.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ');
}

/* ---------- formatting ---------- */
function isMobileWidth(){ return window.matchMedia('(max-width:640px)').matches; }
function fmtFullRaw(n){
  n = Math.round(Number(n) || 0);
  const neg = n < 0;
  n = Math.abs(n);
  const str = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + 'R' + str;
}
function fmtHeroAmount(n){
  const num = Number(n) || 0;
  const neg = num < 0;
  const abs = Math.abs(num);
  const parts = abs.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + 'R' + parts.join('.');
}
function fmtShort(n){
  const neg = n<0; n = Math.abs(n);
  let out;
  if(n>=1000000) out = 'R'+(n/1000000).toFixed(n%1000000===0?0:1)+'M';
  else if(n>=1000) out = 'R'+(n/1000).toFixed(n%1000===0?0:1)+'K';
  else out = 'R'+Math.round(n);
  return (neg?'-':'') + out;
}
// fmtFull is used all over the dashboard (stat cards, mini tables,
// previews, customer page) for what's meant to be the "full" amount.
// On phones those spelled-out numbers ("R18 000") were overlapping
// neighbouring UI, so on mobile widths this quietly shortens to "R18K"
// instead — same short style already used in the main loans table.
// Use fmtFullRaw() directly for spots that must always stay full length
// (e.g. tooltip text).
function fmtFull(n){ return isMobileWidth() ? fmtShort(n) : fmtFullRaw(n); }
function moneySpan(n){ return `<span class="money" data-full="${fmtFullRaw(n)}">${fmtShort(n)}</span>`; }
function attachMoneyTooltips(){
  document.querySelectorAll('.money').forEach(el=>{
    el.addEventListener('mousemove', e=> showTooltip(e, el.dataset.full));
    el.addEventListener('mouseleave', hideTooltip);
  });
}

const COLORS = { new:'#3B82F6', rollover:'#60A5FA', defaulted:'#EF4444' };

function clientScoped(){
  return prefs.client==='all' ? loans : loans.filter(l=>l.customer===prefs.client);
}
function tableScoped(){
  let list = periodLoans(clientScoped());
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if(q) list = list.filter(l=>l.customer.toLowerCase().includes(q));
  const {field,dir} = prefs.sort;
  list = [...list].sort((a,b)=>{
    let av=a[field], bv=b[field];
    if(field==='principal'){ av=Number(av); bv=Number(bv); }
    if(av<bv) return dir==='asc'?-1:1;
    if(av>bv) return dir==='asc'?1:-1;
    return 0;
  });
  return list;
}

/* ---------- risk assessment ---------- */
function customerLoans(name){
  const key = (name||'').trim().toLowerCase();
  if(!key) return [];
  return loans.filter(l=>l.customer.trim().toLowerCase()===key);
}

function assessRisk(name){
  const hist = customerLoans(name);
  if(hist.length===0){
    return {
      level:'new', label:'No history', score:null,
      recommendation:'No prior loans on record for this person — use standard vetting before approving.',
      reasons:[]
    };
  }

  const today = new Date(todayStr()+'T00:00:00');
  const defaults = hist.filter(l=>l.status==='defaulted');
  const timed = hist.filter(l=> (l.status==='settled'||l.status==='rolled') && typeof l.daysLate==='number');
  const early = timed.filter(l=>l.daysLate<0);
  const onTime = timed.filter(l=>l.daysLate===0);
  const lateMinor = timed.filter(l=>l.daysLate>0 && l.daysLate<=7);
  const lateMajor = timed.filter(l=>l.daysLate>7);
  const activeRollovers = hist.filter(l=>l.status==='active' && l.cycleType==='rollover');
  // Active loans already past their repayment date carry real risk, but
  // previously weren't scored at all until someone manually settled or
  // defaulted them — so an overdue-but-still-active loan was invisible
  // here. Score it the same way a late settlement would be.
  const overdueActive = hist
    .filter(l=>l.status==='active')
    .map(l=>({ loan:l, daysOverdue: daysBetween(today, loanDueDate(l)) }))
    .filter(x=>x.daysOverdue>0);
  const overdueMajor = overdueActive.filter(x=>x.daysOverdue>7);
  const overdueMinor = overdueActive.filter(x=>x.daysOverdue>0 && x.daysOverdue<=7);

  let score = 100;
  score -= defaults.length*40;
  score -= lateMajor.length*15;
  score -= lateMinor.length*6;
  score += early.length*4;
  score += onTime.length*2;
  score -= activeRollovers.reduce((s,l)=>s+l.rolloverCount,0)*4;
  score -= overdueMajor.length*15;
  score -= overdueMinor.length*6;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const reasons = [];
  if(defaults.length) reasons.push(`${defaults.length} defaulted loan${defaults.length>1?'s':''} on record`);
  if(lateMajor.length) reasons.push(`${lateMajor.length} repayment${lateMajor.length>1?'s':''} more than a week late`);
  if(lateMinor.length) reasons.push(`${lateMinor.length} minor late repayment${lateMinor.length>1?'s':''} (1–7 days)`);
  if(overdueMajor.length) reasons.push(`${overdueMajor.length} active loan${overdueMajor.length>1?'s':''} currently more than a week past the repayment date`);
  if(overdueMinor.length) reasons.push(`${overdueMinor.length} active loan${overdueMinor.length>1?'s':''} currently 1–7 days past the repayment date`);
  if(early.length) reasons.push(`${early.length} repayment${early.length>1?'s':''} made early`);
  if(onTime.length) reasons.push(`${onTime.length} repayment${onTime.length>1?'s':''} made exactly on time`);
  if(activeRollovers.length) reasons.push(`Currently ${activeRollovers.length} active rollover loan${activeRollovers.length>1?'s':''}`);

  // A customer whose only loan(s) are still active, current, and have
  // never completed a repayment cycle has no actual repayment behavior
  // to judge — previously this fell through to a full 100/"Low risk"
  // score, indistinguishable from someone with a proven track record.
  const unproven = timed.length===0 && defaults.length===0 && overdueActive.length===0;
  if(unproven){
    return {
      level:'new', label:'Unproven', score:null,
      recommendation:'This customer has an active loan but no completed repayment cycle yet — there\'s no repayment history to score. Treat as new until the current loan is repaid or comes due.',
      reasons: reasons.length ? reasons : ['No completed repayment cycle yet for this customer.']
    };
  }
  if(!reasons.length) reasons.push('No repayment timing recorded yet for this customer.');

  let level, label, recommendation;
  if(score>=75){
    level='low'; label='Low risk';
    recommendation='Recommended to lend — strong history of early/on-time repayment.';
  } else if(score>=50){
    level='medium'; label='Medium risk';
    recommendation='Lend with caution — consider a smaller principal, shorter cycle, or guarantor.';
  } else {
    level='high'; label='High risk';
    recommendation='Not recommended — history shows defaults, repeated late payments, or currently overdue loans.';
  }

  return { level, label, score, recommendation, reasons };
}

const RISK_GAUGE_MAX = 200; // display scale — the underlying 0-100 score
// now fills only the left half of the dial, leaving headroom on the ring
// (a raw "perfect" 100 score reads as "100/200" and sits at 12 o'clock).

function riskGaugeSVG(score, level){
  const cx=100, cy=104, r=76, sw=13;
  const frac = score===null ? 0 : Math.max(0, Math.min(1, score/RISK_GAUGE_MAX));
  const circumference = Math.PI * r;
  const filled = circumference * frac;
  const gap = circumference - filled;
  const angle = 180 - frac*180;
  const rad = angle * Math.PI/180;
  const px = cx + r*Math.cos(rad), py = cy - r*Math.sin(rad);
  const trackPath = `M${cx-r} ${cy} A${r} ${r} 0 0 1 ${cx+r} ${cy}`;
  const valueText = score===null ? '—' : score;

  return `
  <svg class="risk-gauge" viewBox="0 0 200 128" role="img" aria-label="Credit score gauge">
    <path d="${trackPath}" fill="none" stroke="var(--border)" stroke-width="${sw}" stroke-linecap="round"/>
    <path d="${trackPath}" fill="none" stroke="var(--ink)" stroke-width="${sw}" stroke-linecap="round"
      stroke-dasharray="${filled.toFixed(2)} ${gap.toFixed(2)}" opacity="${score===null?0.25:1}"/>
    <circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="6.5" fill="#fff" stroke="var(--ink)" stroke-width="3"/>
    <text x="${cx}" y="${cy-14}" text-anchor="middle" class="risk-gauge-num">${valueText}</text>
    <text x="${cx}" y="${cy+6}" text-anchor="middle" class="risk-gauge-max">out of ${RISK_GAUGE_MAX}</text>
  </svg>`;
}

function riskPanelHTML(name){
  // Synchronous placeholder only — used while the OCR/finance-based
  // lookup in renderRiskPanel() is in flight, or when there's no name yet.
  if(!name || !name.trim()) return 'Start typing a name to see their risk profile.';
  return `<div class="risk-gauge-wrap">${riskGaugeSVG(null)}</div><div class="risk-panel-below"><div class="risk-badge new">Checking loan history &amp; documents…</div></div>`;
}

// Blends the existing loan-history score with the OCR-extracted, AI-categorized
// spending behavior from any bank statements uploaded on the Finance page
// (see financeRiskAdjustment / lib/financeParse.js / lib/financeCategorize.js).
// A customer with no loan history yet but a processed statement gets a
// neutral starting score so the document data still has something to adjust.
function blendedRiskFromCategories(name, categories){
  const base = assessRisk(name);
  let score = base.score;
  let reasons = [...base.reasons];

  if(categories && categories.length){
    const { penalty, notes } = financeRiskAdjustment(categories);
    if(score===null) score = 70; // no loan history — start from a neutral baseline
    score = Math.max(0, Math.min(100, score - penalty));
    notes.forEach(n=> reasons.push(`${n.text} (from bank statement OCR)`));
  }

  let level, label, recommendation;
  if(score===null){
    level='new'; label='No history';
    recommendation='No prior loans or bank statements on record for this person — use standard vetting before approving.';
  } else if(score>=75){
    level='low'; label='Low risk';
    recommendation='Recommended to lend — strong history of early/on-time repayment.';
  } else if(score>=50){
    level='medium'; label='Medium risk';
    recommendation='Lend with caution — consider a smaller principal, shorter cycle, or guarantor.';
  } else {
    level='high'; label='High risk';
    recommendation='Not recommended — history shows defaults, repeated late payments, or risky spending patterns.';
  }
  if(!reasons.length) reasons.push('No repayment timing or bank statement data recorded yet for this customer.');

  return { level, label, score, recommendation, reasons };
}

async function computeBlendedRisk(name){
  let categories = null;
  try{
    const res = await authFetch(API_BASE + '/api/finance/summary/' + encodeURIComponent(name));
    if(res.ok){
      const summary = await res.json();
      const hasStatements = (summary.documents||[]).some(d=>d.type==='bank_statement');
      if(hasStatements && summary.categories && summary.categories.length) categories = summary.categories;
    }
  }catch(err){ console.error('Finance risk lookup failed:', err); }
  return blendedRiskFromCategories(name, categories);
}

// Splits a customer's risk signals into severity buckets (matching the
// coloring used across the risk page: high/medium/low) — reused by both
// the "risk events" ring card and the "categorized signals" donut card.
function riskEventBreakdown(name, categories){
  const hist = customerLoans(name);
  const today = new Date(todayStr()+'T00:00:00');
  const defaults = hist.filter(l=>l.status==='defaulted');
  const timed = hist.filter(l=> (l.status==='settled'||l.status==='rolled') && typeof l.daysLate==='number');
  const early = timed.filter(l=>l.daysLate<0);
  const onTime = timed.filter(l=>l.daysLate===0);
  const lateMinor = timed.filter(l=>l.daysLate>0 && l.daysLate<=7);
  const lateMajor = timed.filter(l=>l.daysLate>7);
  const activeRollovers = hist.filter(l=>l.status==='active' && l.cycleType==='rollover');
  const overdueActive = hist
    .filter(l=>l.status==='active')
    .map(l=>daysBetween(today, loanDueDate(l)))
    .filter(d=>d>0);
  const overdueMajor = overdueActive.filter(d=>d>7);
  const overdueMinor = overdueActive.filter(d=>d>0 && d<=7);

  const high=[], medium=[], low=[];
  if(defaults.length) high.push(`${defaults.length} defaulted loan${defaults.length>1?'s':''}`);
  if(lateMajor.length) high.push(`${lateMajor.length} repayment${lateMajor.length>1?'s':''} more than a week late`);
  if(overdueMajor.length) high.push(`${overdueMajor.length} active loan${overdueMajor.length>1?'s':''} over a week overdue`);
  if(lateMinor.length) medium.push(`${lateMinor.length} minor late repayment${lateMinor.length>1?'s':''} (1–7 days)`);
  if(overdueMinor.length) medium.push(`${overdueMinor.length} active loan${overdueMinor.length>1?'s':''} 1–7 days overdue`);
  if(activeRollovers.length) medium.push(`${activeRollovers.length} active rollover loan${activeRollovers.length>1?'s':''}`);
  if(early.length) low.push(`${early.length} early repayment${early.length>1?'s':''}`);
  if(onTime.length) low.push(`${onTime.length} on-time repayment${onTime.length>1?'s':''}`);

  if(categories && categories.length){
    const { notes } = financeRiskAdjustment(categories);
    notes.forEach(n=>{ (n.level==='high' ? high : medium).push(n.text); });
  }
  return { high, medium, low };
}

function riskFeatureGridHTML(customer, blended, breakdown, categories){
  const eventCount = breakdown.high.length + breakdown.medium.length;
  const positiveCount = breakdown.low.length;

  // Card 1 — concentric rings echo "scanning" the customer's documents +
  // loan history, with the total flagged risk events in the center pill.
  const ringColors = ['#000000','#6b7280','#9ca3af'];
  const rings = [76,58,40].map((r,i)=>{
    const c = 2*Math.PI*r;
    const frac = i===0 ? Math.min(1, eventCount/6) : i===1 ? Math.min(1, breakdown.high.length/4) : Math.min(1, positiveCount/6);
    const dash = (c*Math.max(frac,0.06)).toFixed(1);
    return `<circle cx="90" cy="90" r="${r}" stroke="${ringColors[i]}" stroke-width="9" stroke-dasharray="${dash} ${c.toFixed(1)}" opacity="${0.85-i*0.15}"/>`;
  }).join('');
  const card1 = `
    <div class="risk-feature-card">
      <div class="risk-feature-visual">
        <svg class="risk-rings" width="150" height="150" viewBox="0 0 180 180">${rings}</svg>
        <div class="risk-events-pill">Risk events: ${eventCount}</div>
      </div>
      <div class="risk-feature-title">Real-Time Document &amp; Loan Analysis</div>
      <div class="risk-feature-sub">Scans this customer's loan history and uploaded bank statements to flag risk factors as they appear.</div>
    </div>`;

  // Card 2 — donut + legend, severity-bucketed.
  const segs = [
    { label:'High', count: breakdown.high.length, color:'#ef4444' },
    { label:'Medium', count: breakdown.medium.length, color:'#f59e0b' },
    { label:'Low / positive', count: positiveCount, color:'#10b981' },
  ];
  const segTotal = segs.reduce((s,x)=>s+x.count,0) || 1;
  let acc = 0;
  const donutStops = segs.map(s=>{
    const start = acc/segTotal*360; acc += s.count;
    const end = acc/segTotal*360;
    return `${s.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  }).join(', ');
  const card2 = `
    <div class="risk-feature-card">
      <div class="risk-feature-visual">
        <div class="risk-donut-row">
          <div class="risk-donut" style="width:88px;height:88px;border-radius:50%;background:conic-gradient(${segTotal>0?donutStops:'var(--border) 0deg 360deg'});display:flex;align-items:center;justify-content:center;">
            <div style="width:52px;height:52px;border-radius:50%;background:var(--card);"></div>
          </div>
          <div class="risk-legend">
            ${segs.map(s=>`<div class="risk-legend-item"><span class="risk-legend-dot" style="background:${s.color}"></span>${s.label}<span class="risk-legend-count">${s.count}</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="risk-feature-title">Categorized Risk Signals</div>
      <div class="risk-feature-sub">Repayment history and spending behavior signals, grouped by severity.</div>
    </div>`;

  // Card 3 — reuses the existing gauge component.
  const card3 = `
    <div class="risk-feature-card">
      <div class="risk-feature-visual">${riskGaugeSVG(blended.score)}</div>
      <div class="risk-feature-title">Blended Risk Score</div>
      <div class="risk-feature-sub">${blended.label} — combines loan repayment history with bank statement spending analysis.</div>
    </div>`;

  // Card 4 — mini bar chart of spending categories (compliance tracking).
  const barColors = ['#000000','#6b7280','#f59e0b','#ef4444'];
  const top = (categories||[]).slice().sort((a,b)=>b.total-a.total).slice(0,4);
  const maxVal = Math.max(1, ...top.map(c=>Number(c.total)));
  const barsHTML = top.length ? top.map((c,i)=>{
    const h = Math.max(6, Math.round(Number(c.total)/maxVal*100));
    return `<div class="risk-mini-bar-col">
      <div class="risk-mini-bar-track"><div class="risk-mini-bar-fill" style="height:${h}%;background:${barColors[i%barColors.length]}"></div></div>
      <div class="risk-mini-bar-label">${c.category}</div>
    </div>`;
  }).join('') : '<div class="fin-empty" style="padding:0;">No spending data yet.</div>';
  const card4 = `
    <div class="risk-feature-card">
      <div class="risk-feature-visual"><div class="risk-mini-bars">${barsHTML}</div></div>
      <div class="risk-feature-title">Spending Compliance Tracking</div>
      <div class="risk-feature-sub">Top spending categories from this customer's uploaded bank statements.</div>
    </div>`;

  return card1 + card2 + card3 + card4;
}

// Renders the full gauge + badge + reasons into `elId`, keyed off the
// live value of `inputId` so a stale, slower fetch can't clobber a
// newer name the user has since typed.
async function renderRiskPanel(name, elId, inputId){
  const el = document.getElementById(elId);
  if(!el) return;
  name = (name||'').trim();
  if(!name){ el.innerHTML = 'Start typing a name to see their risk profile.'; return; }
  el.innerHTML = riskPanelHTML(name);
  const a = await computeBlendedRisk(name);
  if(inputId && document.getElementById(inputId).value.trim() !== name) return; // stale
  const reasonsHTML = a.reasons.length ? `<ul class="risk-reasons">${a.reasons.map(r=>`<li>${r}</li>`).join('')}</ul>` : '';
  el.innerHTML = `
    <div class="risk-gauge-wrap">${riskGaugeSVG(a.score)}</div>
    <div class="risk-panel-below">
      <div class="risk-badge ${a.level}">${a.label}</div>
      <div class="risk-reco">${a.recommendation}</div>
      ${reasonsHTML}
    </div>`;
}

function promptDaysLate(){
  const raw = window.prompt('Repayment timing for this cycle — enter days late (negative = paid early, 0 = on time, positive = days late):', '0');
  if(raw===null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function computeStats(list){
  const active = list.filter(l=>l.status==='active');
  const rolled = list.filter(l=>l.status==='rolled');
  const settled = list.filter(l=>l.status==='settled');
  const defaulted = list.filter(l=>l.status==='defaulted');
  const netProfit = [...rolled, ...settled].reduce((s,l)=>s+l.interest,0);
  const outstanding = active.reduce((s,l)=>s+l.principal,0);
  const resolvedTotal = rolled.length + settled.length + defaulted.length || 1;
  const collectionPct = Math.round((rolled.length+settled.length)/resolvedTotal*100);
  const activeRollovers = active.filter(l=>l.cycleType==='rollover').length;
  const activeTotal = active.length || 1;
  const rolloverSharePct = Math.round(activeRollovers/activeTotal*100);
  const total = list.length || 1;
  const bucket = { new:0, rollover:0, defaulted:0 };
  list.forEach(l=>{
    if(l.status==='defaulted') bucket.defaulted++;
    else if(l.cycleType==='rollover') bucket.rollover++;
    else bucket.new++;
  });
  return {
    activeCount:active.length, rolledCount:rolled.length, settledCount:settled.length, defaultedCount:defaulted.length,
    netProfit, outstanding,
    collectionPct, resolvedCount: rolled.length+settled.length,
    activeRollovers, rolloverSharePct,
    mixPct: { new: Math.round(bucket.new/total*100), rollover: Math.round(bucket.rollover/total*100), defaulted: Math.round(bucket.defaulted/total*100) }
  };
}
function trailingDates(n){
  const out=[]; const base=new Date();
  for(let i=n-1;i>=0;i--){ const d=new Date(base); d.setDate(d.getDate()-i); out.push(d.toISOString().slice(0,10)); }
  return out;
}
function seriesValues(list, dates, fn){ return dates.map(d=> fn(list.filter(l=>l.date===d))); }
function pctChange(values){
  const n=values.length, half=Math.floor(n/2);
  const first = values.slice(0,half).reduce((a,b)=>a+b,0);
  const second = values.slice(half).reduce((a,b)=>a+b,0);
  if(first===0) return second>0 ? 100 : 0;
  return Math.round(((second-first)/first)*100);
}
// Compares this calendar month's total against last calendar month's —
// used for the dashboard stat badges instead of pctChange(). Loans get
// entered in a batch on day 1 of each month, so a rolling 14-day split
// (pctChange) makes the badge swing negative as the month goes on even
// though nothing's actually down. This only goes red when the current
// month has genuinely brought in less than the previous one; otherwise
// it stays green all month, regardless of what day it is.
function monthOverMonthDelta(scoped, fn){
  const now = new Date();
  const curKey = monthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevKey = monthKey(prevDate);

  const curVal = fn(scoped.filter(l=> (l.date||'').slice(0,7)===curKey));
  const prevVal = fn(scoped.filter(l=> (l.date||'').slice(0,7)===prevKey));

  const pct = prevVal===0 ? (curVal>0 ? 100 : 0) : Math.round(((curVal-prevVal)/prevVal)*100);
  return { pct, up: curVal >= prevVal };
}
// Last n calendar months as 'YYYY-MM' strings, oldest first, current
// month included. Loans batch in on the 1st of each month, so plotting
// by month (instead of by day) is what actually gives a real, readable
// trend instead of a single spike per month.
// Local-time 'YYYY-MM' / 'YYYY-MM-DD' keys. toISOString() converts to UTC,
// which for anyone ahead of UTC (e.g. South Africa, UTC+2) pushes a local
// midnight back to the previous day/month and made the current month vanish
// from the dashboard's monthly series.
function monthKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function localDateKey(d){ return monthKey(d) + '-' + String(d.getDate()).padStart(2,'0'); }
function trailingMonths(n){
  const out=[]; const base=new Date();
  for(let i=n-1;i>=0;i--){
    const d = new Date(base.getFullYear(), base.getMonth()-i, 1);
    out.push(monthKey(d));
  }
  return out;
}
function monthlySeriesValues(list, months, fn){
  return months.map(m => fn(list.filter(l => (l.date||'').slice(0,7)===m)));
}

// Real line, plotted from real monthly totals — straight segments (not a
// smoothed spline) so the line can only slope downward between two points
// when that month's actual number is genuinely lower than the one before
// it; a smoothed curve can overshoot and fake a dip that isn't really there.
function sparklinePath(values, w=100, h=28){
  if(!values.length) return '';
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = (max-min) || 1;
  const padX = 2, padY = 4;
  const n = values.length;
  const pts = values.map((v,i)=>{
    const t = n>1 ? i/(n-1) : 0;
    const x = padX + t*(w-padX*2);
    const y = (h-padY) - ((v-min)/range)*(h-padY*2);
    return [x,y];
  });
  return pts.map((p,i)=> (i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
}
function loanCode(l){ const parts=l.id.split('-'); return 'LN-'+(parts[1]||'00000').slice(-5); }
// Compact form of timeAgoLabel for tight one-line rows: "Today",
// "1d", "6d", "3w", "5mo", "2y".
function shortTimeAgoLabel(dateStr){
  const d = new Date(dateStr+'T00:00:00'), now = new Date();
  const days = Math.round((now-d)/86400000);
  if(days <= 0) return 'Today';
  if(days < 7) return days+'d';
  if(days < 31) return Math.round(days/7)+'w';
  if(days < 365) return Math.round(days/30)+'mo';
  return Math.round(days/365)+'y';
}
function timeAgoLabel(dateStr){
  const d=new Date(dateStr+'T00:00:00'), now=new Date();
  const diffDays = Math.round((now-d)/86400000);
  if(diffDays<=0) return 'Today';
  if(diffDays===1) return '1 day ago';
  return `${diffDays} days ago`;
}

/* ---------- tooltip ---------- */
const tooltipEl = document.getElementById('chartTooltip');
function showTooltip(e, text){
  tooltipEl.textContent = text; tooltipEl.style.display='block';
  tooltipEl.style.left = (e.clientX+14)+'px'; tooltipEl.style.top = (e.clientY-10)+'px';
}
function hideTooltip(){ tooltipEl.style.display='none'; }


/* ─────────────────────────────────────────────────────────────
   Dashboard reporting period (the hero card's date-range picker).
   Drives the hero total, the four stat cards and the Disbursements
   Over Time chart. Everything else on the page (donut, recent loans,
   activity, tables) keeps showing the whole book, as before.
   ───────────────────────────────────────────────────────────── */
const DATE_RANGE_LABELS = {
  thisMonth:'This month',
  lastMonth:'Last month',
  last3:'Last 3 months',
  last6:'Last 6 months',
  custom:'Custom range'
};

function dateRangePrefs(){
  if(!prefs.dateRange || typeof prefs.dateRange !== 'object'){
    prefs.dateRange = { mode:'thisMonth', start:'', end:'' };
  }
  if(!DATE_RANGE_LABELS[prefs.dateRange.mode]) prefs.dateRange.mode = 'thisMonth';
  return prefs.dateRange;
}

function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function daysBetween(a, b){ return Math.round((b - a)/86400000) + 1; }

// Resolves the saved picker state into concrete { start, end } Date
// objects plus the button label.
function resolveDateRange(){
  const dr = dateRangePrefs();
  const now = new Date();
  let start, end;
  switch(dr.mode){
    case 'lastMonth': {
      const prev = new Date(now.getFullYear(), now.getMonth()-1, 1);
      start = startOfMonth(prev); end = endOfMonth(prev); break;
    }
    case 'last3':
      start = new Date(now.getFullYear(), now.getMonth()-2, 1); end = endOfMonth(now); break;
    case 'last6':
      start = new Date(now.getFullYear(), now.getMonth()-5, 1); end = endOfMonth(now); break;
    case 'custom': {
      const s = dr.start ? new Date(dr.start + 'T00:00:00') : null;
      const e = dr.end   ? new Date(dr.end   + 'T00:00:00') : null;
      if(s && e && !isNaN(s) && !isNaN(e) && s <= e){ start = s; end = e; break; }
      start = startOfMonth(now); end = endOfMonth(now); break;   // fall back
    }
    case 'thisMonth':
    default:
      start = startOfMonth(now); end = endOfMonth(now); break;
  }
  let label = DATE_RANGE_LABELS[dr.mode] || DATE_RANGE_LABELS.thisMonth;
  if(dr.mode === 'custom'){
    const f = d => d.toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'2-digit' });
    label = `${f(start)} – ${f(end)}`;
  }
  return { mode: dr.mode, start, end, label };
}

function loansInRange(list, range){
  const a = localDateKey(range.start), b = localDateKey(range.end);
  return list.filter(l => { const d = (l.date || '').slice(0,10); return d && d >= a && d <= b; });
}

// Loans inside the dashboard's selected period (This month / Last month /
// Last 3 / Last 6 / Custom). Every page that LISTS loans uses this so the
// period picker acts as a platform-wide filter. Risk scoring, reminders,
// cash balance etc. deliberately keep using the full `loans` history.
function periodLoans(list){
  return loansInRange(list || loans, resolveDateRange());
}

// The comparable window immediately before the selected one — what the
// hero's "vs previous period" percentage is measured against. Calendar
// modes step back whole months (so "This month" really compares against
// all of last month); a custom range steps back by its own length.
function previousRange(range){
  const monthsBack = { thisMonth:1, lastMonth:1, last3:3, last6:6 }[range.mode];
  if(monthsBack){
    const s = new Date(range.start.getFullYear(), range.start.getMonth()-monthsBack, 1);
    const e = endOfMonth(new Date(range.end.getFullYear(), range.end.getMonth()-monthsBack, 1));
    return { start:s, end:e };
  }
  const len = daysBetween(range.start, range.end);
  const end = addDays(range.start, -1);
  return { start: addDays(end, -(len-1)), end };
}

// Splits the range into chart/sparkline buckets: day-by-day for short
// windows (a single month or less), month-by-month for longer ones —
// so a one-month period isn't drawn as a single lonely point.
function rangeBuckets(range){
  const days = daysBetween(range.start, range.end);
  const buckets = [];
  if(days <= 62){
    for(let d = new Date(range.start); d <= range.end; d = addDays(d, 1)){
      buckets.push({
        key: localDateKey(d), len: 10,
        short: d.toLocaleDateString('en-ZA', { day:'numeric', month:'short' }),
        long:  d.toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })
      });
    }
  } else {
    let d = startOfMonth(range.start);
    while(d <= range.end){
      buckets.push({
        key: monthKey(d), len: 7,
        short: d.toLocaleDateString('en-ZA', { month:'short' }),
        long:  d.toLocaleDateString('en-ZA', { month:'long', year:'numeric' })
      });
      d = new Date(d.getFullYear(), d.getMonth()+1, 1);
    }
  }
  return buckets;
}

function bucketValues(list, buckets, fn){
  return buckets.map(b => fn(list.filter(l => (l.date || '').slice(0, b.len) === b.key)));
}

/* ---------- render ---------- */
function render(){
  const businessName = (prefs.businessName || '').trim();
  document.getElementById('userName').textContent = businessName || 'TrackLend';
  const initials = businessName
    ? businessName.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('')
    : 'NL';
  document.getElementById('userAvatar').textContent = initials;

  // Reporting period from the hero's date-range picker. The hero total,
  // the stat cards and the disbursements chart are all scoped to it.
  const range = resolveDateRange();
  renderDateRangeUI(range);

  const scoped = clientScoped();
  const inRange = loansInRange(scoped, range);
  const buckets = rangeBuckets(range);

  const defaultedTotal = loans.filter(l=>l.status==='defaulted').length;
  document.getElementById('alertDot')?.style && (document.getElementById('alertDot').style.display = defaultedTotal>0 ? '' : 'none');

  const disbursedVals = bucketValues(inRange, buckets, arr=>arr.reduce((s,l)=>s+l.principal,0));

  const prevLoans = loansInRange(scoped, previousRange(range));

  renderHeroGreeting(businessName, scoped, range);
  renderStatCards(inRange, prevLoans, range, buckets, disbursedVals);
  renderClientDonut(inRange);
  renderClientMap(inRange);
  renderDisbursementsChart(inRange, range);
  renderRecentLoans(inRange);
  renderActivityFeed();
  // Keep the other pages in sync with the selected period too.
  try{
    if(currentPage === 'customers') renderCustomers();
    if(currentPage === 'loans') renderExposure();
    if(currentPage === 'expenses') renderExpenses();
  }catch(e){ /* currentPage not initialised yet on very first paint */ }
  if(typeof renderTable === 'function') renderTable();

  renderCustomizePop();
  attachMoneyTooltips();
  checkLoanDueAlerts();
}

// Scans active loans for repayment dates that are due soon (within 2 days)
// or already overdue, and emails an alert once per loan per day (tracked
// in localStorage so a page refresh doesn't resend the same alert).
function checkLoanDueAlerts(){
  const to = prefs.notifyEmail;
  if(!to || !prefs.notifyEvents) return;
  const sentKey = 'tracklend_due_alerts_sent';
  let sent = [];
  try{ sent = JSON.parse(localStorage.getItem(sentKey) || '[]'); }catch(_e){ sent = []; }
  const today = todayStr();
  const msPerDay = 86400000;
  const now = new Date(today);

  loans.filter(l=> l.status==='active' && l.repaymentDate).forEach(loan=>{
    const due = new Date(loan.repaymentDate);
    const daysUntil = Math.round((due - now) / msPerDay);
    let type = null;
    if(daysUntil < 0 && prefs.notifyEvents.overdue) type = 'overdue';
    else if(daysUntil >= 0 && daysUntil <= 2 && prefs.notifyEvents.dueSoon) type = 'dueSoon';
    if(!type) return;

    const key = loan.id + '_' + type + '_' + today;
    if(sent.includes(key)) return;

    const subject = type==='overdue'
      ? `Overdue — ${loan.customer} — R${loan.principal}`
      : `Repayment due soon — ${loan.customer} — R${loan.principal}`;
    const text = type==='overdue'
      ? `${loan.customer}'s loan (R${loan.principal}, total due R${loan.totalDue}) was due on ${loan.repaymentDate} and has not been marked as repaid.`
      : `${loan.customer}'s loan (R${loan.principal}, total due R${loan.totalDue}) is due on ${loan.repaymentDate}.`;

    fetch(API_BASE + '/api/notify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ to, subject, text })
    }).then(res=>res.json()).then(data=>{
      if(data.ok){
        sent.push(key);
        localStorage.setItem(sentKey, JSON.stringify(sent.slice(-500)));
      }
    }).catch(()=>{});
  });
}
function moneyIsh(n){
  const num = Number(n) || 0;
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// Greets by time of day, and shows this month's total disbursed as the
// hero's headline number (mirrors the reference mockup's hero), with a
// trend line comparing it to last month — computed the same way as every
// other metric's own trend, independent of the rest of the dashboard.
function renderHeroGreeting(businessName, scoped, range){
  const greetEl = document.getElementById('heroGreeting');
  if(!greetEl) return;
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = (businessName || '').trim().split(/\s+/)[0] || '';
  greetEl.textContent = name ? `${part}, ${name}` : part;

  // Headline = everything disbursed inside the selected period; the
  // comparison is the equally-long window right before it.
  const sum = list => list.reduce((s,l)=>s+l.principal, 0);
  const curr = sum(loansInRange(scoped, range));
  const prevR = previousRange(range);
  const prev = sum(loansInRange(scoped, prevR));

  document.getElementById('heroAmount').textContent = fmtHeroAmount(curr);

  const periodWord = {
    thisMonth:'this month', lastMonth:'last month',
    last3:'in the last 3 months', last6:'in the last 6 months'
  }[range.mode] || 'in this period';
  const vsWord = range.mode === 'thisMonth' ? 'vs last month' : 'vs previous period';

  const subEl = document.getElementById('heroSubtext');
  if(curr === prev){
    subEl.innerHTML = `Total disbursed ${periodWord}`;
  } else {
    const up = curr > prev;
    const pct = prev ? Math.round(Math.abs(curr-prev)/prev*100) : 100;
    const cls = up ? 'trend-up' : 'trend-down';
    const arrow = up ? '↑' : '↓';
    subEl.innerHTML = `Total disbursed ${periodWord} &middot; <b class="${cls}">${arrow} ${pct}%</b> ${vsWord}`;
  }
}

// Each metric's trend arrow compares that metric's own last two monthly
// totals to each other — never derived from any other metric's direction.
function trendDirection(spark){
  if(!spark || spark.length < 2) return 'flat';
  const curr = spark[spark.length-1], prev = spark[spark.length-2];
  if(curr > prev) return 'up';
  if(curr < prev) return 'down';
  return 'flat';
}
function trendArrowSvg(dir){
  if(dir==='flat') return '';
  const path = dir==='up' ? 'M4 14l6-6 4 4 6-8' : 'M4 6l6 6 4-4 6 8';
  const cls = dir==='up' ? 'trend-up' : 'trend-down';
  return `<svg class="stat-trend-icon ${cls}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

// "Disbursements Over Time" — a 12-bar column chart, one bar per calendar
// month (Jan…Dec) of the year the selected reporting period ends in.
// Bar height is that month's disbursed total; the label above each bar is
// the interest earned in that month. Trend pill compares the latest month
// that has data to the one before it.
function renderDisbursementsChart(scoped, range){
  const svg = document.getElementById('disbChart');
  if(!svg) return;

  const year = (range && range.end ? range.end : new Date()).getFullYear();
  const months = [];
  for(let m = 0; m < 12; m++){
    const d = new Date(year, m, 1);
    months.push({
      key: monthKey(d),
      short: d.toLocaleDateString('en-ZA', { month:'short' }).replace('.','').slice(0,3),
      long:  d.toLocaleDateString('en-ZA', { month:'long', year:'numeric' })
    });
  }

  const inYear = m => scoped.filter(l => (l.date || '').slice(0,7) === m.key);
  const vals     = months.map(m => inYear(m).reduce((s,l)=>s+l.principal, 0));
  const interest = months.map(m => inYear(m)
    .filter(l => l.status==='settled' || l.status==='rolled')
    .reduce((s,l)=>s+l.interest, 0));

  disbChartState = { months, vals, interest, year };
  drawDisbursementsChart();

  const subEl = document.querySelector('.top-card .panel-sub');
  if(subEl) subEl.textContent = `Monthly totals · ${year}`;

  // Redraw whenever the chart's box changes size (window resize, tab
  // becoming visible) so the line always fills the card at true pixel size
  // instead of being stretched from a fixed viewBox.
  if(!disbChartObserver && typeof ResizeObserver !== 'undefined'){
    disbChartObserver = new ResizeObserver(()=> drawDisbursementsChart());
    disbChartObserver.observe(svg);
  }

  // Compare the last month that has any activity with the one before it,
  // so the pill isn't dragged to "Down" by future months sitting at R0.
  let last = -1;
  vals.forEach((v,i)=>{ if(v) last = i; });
  const dir = last > 0 ? trendDirection([vals[last-1], vals[last]]) : 'flat';
  const pill = document.getElementById('disbTrendPill');
  if(pill){
    pill.className = 'disb-trend-pill' + (dir!=='flat' ? ' trend-'+dir : '');
    pill.innerHTML = dir==='flat' ? '' : trendArrowSvg(dir) + (dir==='up' ? ' Up' : ' Down') + ' vs previous month';
  }
}

let disbChartState = null;
let disbChartObserver = null;

// Draws "Disbursements Over Time" as a 12-month column chart, styled
// after the reference bar chart: a left money axis with dashed
// gridlines, one rounded bar per month, the month's interest earned
// printed above each bar, and Jan…Dec along the bottom.
function drawDisbursementsChart(){
  const svg = document.getElementById('disbChart');
  if(!svg || !disbChartState) return;
  const { months, vals, interest } = disbChartState;
  if(!months || !months.length) return;

  const w = Math.round(svg.clientWidth)  || 560;
  const h = Math.round(svg.clientHeight) || 220;
  const padL = 52;   // room for the money axis
  const padR = 10;
  const padTop = 20; // room for the value label above the tallest bar
  const padBottom = 26;
  const plotW = w - padL - padR;
  const plotH = h - padTop - padBottom;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  // "Nice" axis: pick a round step so all four gridline labels come out as
  // clean numbers (R10K, R20K…) rather than R8.8K-style fractions.
  const rawMax = Math.max(...vals, 0);
  const niceStep = v => {
    if(v <= 0) return 250;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const norm = v / pow;
    const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return mult * pow;
  };
  const step = niceStep(rawMax / 4);
  const niceMax = step * 4;

  const baseY = padTop + plotH;
  const yOf = v => baseY - (v / niceMax) * plotH;

  const n = months.length;
  const slot = plotW / n;
  const barW = Math.max(6, Math.min(46, slot * 0.62));
  const xOf = i => padL + slot*i + (slot - barW)/2;

  // Axis: 5 gridlines (0, 25, 50, 75, 100%) with dashed rules, like the
  // reference chart.
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const axis = ticks.map(f=>{
    const y = yOf(niceMax*f);
    const tickVal = niceMax*f;
    const line = f === 0
      ? `<line x1="${padL}" x2="${w-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#D8E6E2" stroke-width="1"/>`
      : `<line x1="${padL}" x2="${w-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#E6E4EC" stroke-width="1" stroke-dasharray="3 4"/>`;
    return line + `<text x="${padL-8}" y="${(y+3.5).toFixed(1)}" text-anchor="end" font-size="10.5" fill="#6B6B76">${fmtShort(tickVal)}</text>`;
  }).join('');

  // Bars — rounded tops, flat solid black (no gradient).
  const bars = vals.map((v,i)=>{
    const x = xOf(i);
    const y = yOf(v);
    const barH = Math.max(v > 0 ? 2 : 0, baseY - y);
    if(!barH) return '';
    const r = Math.min(5, barW/2, barH);
    return `<path class="disb-bar" data-i="${i}" d="M${x.toFixed(1)},${baseY.toFixed(1)}
      V${(baseY-barH+r).toFixed(1)} Q${x.toFixed(1)},${(baseY-barH).toFixed(1)} ${(x+r).toFixed(1)},${(baseY-barH).toFixed(1)}
      H${(x+barW-r).toFixed(1)} Q${(x+barW).toFixed(1)},${(baseY-barH).toFixed(1)} ${(x+barW).toFixed(1)},${(baseY-barH+r).toFixed(1)}
      V${baseY.toFixed(1)} Z" fill="#000000"/>`;
  }).join('');

  // Interest earned printed above each bar (reference-image style).
  // Skipped where the month has no activity, and thinned out if the card
  // is too narrow for 12 labels to fit side by side.
  const labelEvery = slot < 42 ? 2 : 1;
  const valueLabels = vals.map((v,i)=>{
    if(!v && !interest[i]) return '';
    if(i % labelEvery !== 0) return '';
    const cx = xOf(i) + barW/2;
    const y  = Math.max(11, yOf(v) - 6);
    return `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#14141A">${fmtShort(interest[i])}</text>`;
  }).join('');

  // Jan, Feb, Mar … under each bar.
  const monthLabels = months.map((m,i)=>
    `<text x="${(xOf(i)+barW/2).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="10.5" fill="#6B6B76">${m.short}</text>`
  ).join('');

  svg.innerHTML = `
    ${axis}
    ${bars}
    ${valueLabels}
    ${monthLabels}`;
}

// Headline numbers reflect the period chosen in the hero's date-range
// picker (`inRange`).
function renderStatCards(inRange, prevLoans, range, buckets, disbursedVals){
  const sumPrincipal = list => list.reduce((s,l)=>s+l.principal, 0);
  const sumInterest  = list => list.filter(l=>l.status==='settled'||l.status==='rolled')
                                   .reduce((s,l)=>s+l.interest, 0);

  const totalDisbursed = sumPrincipal(inRange);
  const totalCount     = inRange.length;
  const totalInterest  = sumInterest(inRange);
  const avgLoanSize    = totalCount ? totalDisbursed/totalCount : 0;

  const cards = [
    {label:'Total Disbursed', value:fmtFullRaw(totalDisbursed)},
    {label:'Total Loans',     value:totalCount.toLocaleString('en-ZA')},
    {label:'Interest Earned', value:fmtFullRaw(totalInterest)},
    {label:'Avg Loan Size',   value:fmtFullRaw(avgLoanSize)},
  ];

  document.getElementById('statGrid').innerHTML = cards.map(c=>`
    <div class="card stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value-row">
        <span class="stat-value">${c.value}</span>
      </div>
    </div>`).join('');
}

function clientInitials(name){
  const parts = String(name||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '?';
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
function polarPoint(cx, cy, r, angleDeg){
  const rad = (angleDeg-90) * Math.PI/180;
  return [cx + r*Math.cos(rad), cy + r*Math.sin(rad)];
}
function donutSlicePath(cx, cy, rOuter, rInner, startAngle, endAngle){
  const [x1,y1] = polarPoint(cx,cy,rOuter,startAngle);
  const [x2,y2] = polarPoint(cx,cy,rOuter,endAngle);
  const [x3,y3] = polarPoint(cx,cy,rInner,endAngle);
  const [x4,y4] = polarPoint(cx,cy,rInner,startAngle);
  const largeArc = (endAngle-startAngle) > 180 ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${rOuter},${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${rInner},${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z`;
}

// Thin-ring donut + side legend, styled after the reference mockup.
// Uses the 42x42 viewBox / r=15.9 stroke-dasharray technique (percentages
// map directly to dasharray segments out of a 100-unit circumference).
function renderClientDonut(list){
  const names = Array.from(new Set(list.map(l=>l.customer)));
  const totals = names.map(name=>{
    const val = list.filter(l=>l.customer===name).length;
    return {name, val};
  }).filter(r=>r.val>0).sort((a,b)=>b.val-a.val);

  const svg = document.getElementById('clientDonut');
  const legendEl = document.getElementById('donutLegend');
  const grandTotal = totals.reduce((s,r)=>s+r.val,0);

  if(!grandTotal){
    svg.innerHTML = `<circle cx="21" cy="21" r="15.9" fill="transparent" stroke="var(--border)" stroke-width="6"/>`;
    if(legendEl) legendEl.innerHTML = '';
    return;
  }

  const MAX_SLICES = 5;
  let slices = totals.slice(0, MAX_SLICES);
  const rest = totals.slice(MAX_SLICES);
  if(rest.length){
    slices = [...slices, {name:'Other', val: rest.reduce((s,r)=>s+r.val,0), isOther:true}];
  }

  const palette = ['#000000','#1F5446','#378C77','#5AA593','#8CC2B4','#B9DBD2'];
  let offset = 25; // stroke-dashoffset start (matches mockup's 12-o'clock start)
  const circles = [];
  const legendRows = [];
  slices.forEach((s,i)=>{
    const pct = Math.round((s.val/grandTotal)*1000)/10;
    const dash = (s.val/grandTotal)*100;
    const color = palette[i % palette.length];
    circles.push(`<circle class="donut-slice" cx="21" cy="21" r="15.9" fill="transparent" stroke="${color}" stroke-width="6" stroke-dasharray="${dash.toFixed(2)} ${(100-dash).toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>`);
    offset -= dash;
    legendRows.push(`<div class="legend-item"><span class="legend-dot" style="background:${color};"></span><span class="legend-name">${s.isOther?'Other':s.name}</span><span class="legend-val">${pct}%</span></div>`);
  });

  svg.innerHTML = `<text x="21" y="24" text-anchor="middle" font-size="8" font-weight="700" fill="var(--ink)">${names.length}</text>` + circles.join('');
  if(legendEl) legendEl.innerHTML = legendRows.join('');
}

// ---------- South Africa client map (Dashboard) ----------
// Simplified but contiguous, real-shaped outline of the 9 provinces
// (polygon points, roughly matching true relative geography — not a
// grid of boxes). Each province also carries a keyword list (used to
// guess a province from free-text address when no province was picked)
// and a set of named-town coordinates, so a client's dot lands on the
// actual town/city they're based in rather than just somewhere in the
// province. Everything runs offline — no geocoding API involved.
const SA_PROVINCES = [
  { code:'LP', name:'Limpopo',
    points:'266.1,36.0 233.1,29.4 226.5,31.8 224.1,35.4 213.3,36.6 190.8,56.1 186.9,68.4 180.6,74.4 183.9,77.7 191.4,77.7 198.6,82.5 209.7,81.3 212.7,87.0 214.2,86.4 213.0,86.1 213.3,82.8 222.3,80.4 228.0,89.7 240.6,89.4 245.1,79.8 252.6,79.8 252.9,73.2 262.5,73.2 261.0,68.4 261.3,64.8 273.0,64.8',
    keywords:['limpopo','polokwane','tzaneen','thohoyandou','mokopane','louis trichardt','giyani','musina','phalaborwa','lebowakgomo','bela-bela','modimolle'],
    towns:{ 'polokwane':[219.7,67.8], 'tzaneen':[241.2,79.7], 'thohoyandou':[260.2,56.8], 'musina':[230.4,34.9], 'mokopane':[215.1,79.0], 'giyani':[250.3,70.9], 'phalaborwa':[239.8,82.2], 'louis trichardt':[221.8,45.8], 'lebowakgomo':[214.7,78.7], 'bela-bela':[218.6,77.7], 'modimolle':[217.2,78.2] } },
  { code:'NW', name:'North West',
    points:'210.6,87.6 208.5,83.4 197.1,84.3 190.5,79.8 183.0,79.8 177.9,75.6 170.7,77.7 164.7,96.3 142.2,96.3 126.0,88.2 120.3,88.2 113.4,102.9 115.5,107.4 120.6,99.9 126.0,100.5 124.8,109.2 129.9,110.1 138.0,118.5 139.8,132.0 144.3,132.3 146.7,136.5 148.8,131.1 155.4,132.0 155.7,134.7 153.6,137.4 155.4,139.5 165.9,131.1 179.1,126.9 180.0,120.0 195.6,114.9 191.7,111.3 191.7,108.3 196.2,98.7 203.7,97.5 204.9,87.9',
    keywords:['north west','rustenburg','mahikeng','mafikeng','klerksdorp','potchefstroom','brits','vryburg','lichtenburg','zeerust','orkney','stilfontein'],
    towns:{ 'rustenburg':[192.9,98.4], 'mahikeng':[155.4,99.4], 'mafikeng':[155.4,99.4], 'klerksdorp':[173.6,125.2], 'potchefstroom':[178.0,117.4], 'brits':[200.4,94.9], 'vryburg':[136.2,112.0], 'lichtenburg':[157.6,112.1], 'zeerust':[156.3,99.7], 'orkney':[169.7,126.0], 'stilfontein':[169.3,126.7] } },
  { code:'GP', name:'Gauteng',
    points:'217.8,86.7 212.7,89.7 206.7,89.7 205.5,99.0 204.6,99.6 198.0,100.2 193.5,110.1 198.6,114.0 205.2,114.0 210.6,117.3 219.3,109.8 212.1,106.5 212.1,104.1 215.7,99.9 220.8,99.9 222.0,95.7 218.4,95.7 217.8,95.1',
    keywords:['gauteng','johannesburg','joburg','jozi','pretoria','tshwane','sandton','midrand','centurion','soweto','benoni','boksburg','kempton park','randburg','roodepoort','vereeniging','vanderbijlpark','krugersdorp','alberton','springs','germiston','edenvale','kensington','fourways','bryanston','rosebank','melville','brakpan','nigel','heidelberg'],
    towns:{ 'johannesburg':[205.2,110.9], 'joburg':[205.2,110.9], 'jozi':[205.2,110.9], 'pretoria':[204.9,103.7], 'tshwane':[204.9,103.7], 'sandton':[204.6,110.9], 'midrand':[203.3,107.8], 'centurion':[203.9,105.7], 'soweto':[204.1,111.0], 'benoni':[208.1,112.2], 'boksburg':[208.0,112.0], 'kempton park':[206.5,110.5], 'randburg':[201.3,110.8], 'roodepoort':[200.8,111.0], 'vereeniging':[206.8,111.3], 'vanderbijlpark':[206.8,111.1], 'krugersdorp':[197.7,108.7], 'alberton':[207.1,111.4], 'springs':[210.2,113.3], 'germiston':[207.0,111.2], 'edenvale':[205.6,110.9], 'kensington':[205.7,110.9], 'fourways':[201.3,109.1], 'bryanston':[202.3,110.5], 'rosebank':[205.0,111.0], 'melville':[204.0,110.8], 'brakpan':[209.2,112.7], 'nigel':[210.3,113.5], 'heidelberg':[209.3,112.6] } },
  { code:'MP', name:'Mpumalanga',
    points:'273.6,66.9 263.1,66.9 264.6,75.0 254.4,75.3 254.4,81.6 246.3,81.9 242.1,91.2 226.8,91.8 221.1,82.2 216.3,84.0 219.9,84.6 219.9,93.6 223.8,93.6 224.1,96.9 222.0,102.0 216.6,102.0 214.2,105.0 220.8,107.7 221.4,110.7 212.7,118.5 233.4,130.2 258.9,127.2 253.8,119.4 253.8,109.5 264.0,97.5 266.4,97.5 273.9,101.7 276.6,85.8',
    keywords:['mpumalanga','nelspruit','mbombela','witbank','emalahleni','secunda','standerton','ermelo','barberton','white river','sabie','piet retief','volksrust'],
    towns:{ 'nelspruit':[244.6,112.1], 'mbombela':[244.6,112.1], 'witbank':[226.0,101.2], 'emalahleni':[226.0,101.2], 'secunda':[225.5,122.0], 'standerton':[227.2,122.2], 'ermelo':[231.4,125.1], 'barberton':[248.2,119.3], 'white river':[241.1,107.6], 'sabie':[235.4,113.9], 'piet retief':[239.1,125.6], 'volksrust':[231.4,124.1] } },
  { code:'NC', name:'Northern Cape',
    points:'67.5,80.7 69.9,150.3 63.0,152.1 57.6,160.2 26.1,155.4 18.3,144.9 11.1,154.8 33.9,200.1 48.3,187.2 59.1,212.7 64.5,218.1 64.8,226.8 75.3,220.8 74.7,227.1 85.8,231.3 108.9,207.6 139.8,210.3 161.4,198.0 161.4,189.9 141.9,171.9 153.9,141.6 151.8,138.6 153.6,133.8 150.3,133.2 147.9,138.6 138.0,133.8 135.9,119.4 129.0,112.2 122.7,110.7 124.2,102.3 121.8,102.0 116.7,109.5 111.9,105.0 99.6,117.6 78.9,120.0 77.4,110.7 81.6,101.7 75.3,86.7',
    keywords:['northern cape','kimberley','upington','springbok','de aar','kuruman','postmasburg','colesberg','calvinia','port nolloth'],
    towns:{ 'kimberley':[72.5,127.3], 'upington':[72.9,124.1], 'springbok':[30.6,185.6], 'de aar':[59.2,183.4], 'kuruman':[72.1,105.1], 'postmasburg':[72.7,117.9], 'colesberg':[81.2,176.5], 'calvinia':[56.4,198.1], 'port nolloth':[15.2,155.9] } },
  { code:'FS', name:'Free State',
    points:'232.2,132.0 204.3,116.1 198.3,116.1 181.5,121.8 181.2,128.4 167.7,132.6 156.0,141.9 143.7,170.4 162.9,188.4 182.7,188.4 192.6,183.3 187.8,172.2 187.8,169.8 201.6,154.8 213.6,149.4 216.6,149.4 219.3,153.9 232.2,143.7',
    keywords:['free state','bloemfontein','welkom','sasolburg','vaalpark','parys','bethlehem','kroonstad','harrismith','virginia','bothaville','ficksburg','odendaalsrus'],
    towns:{ 'bloemfontein':[153.8,156.0], 'welkom':[158.3,144.3], 'sasolburg':[166.9,138.6], 'vaalpark':[166.2,138.6], 'parys':[166.4,138.8], 'bethlehem':[167.6,145.0], 'kroonstad':[164.3,140.8], 'harrismith':[174.9,136.8], 'virginia':[160.8,144.0], 'bothaville':[163.1,141.9], 'ficksburg':[157.2,159.5], 'odendaalsrus':[159.6,145.1] } },
  { code:'KZN', name:'KwaZulu-Natal',
    points:'288.6,123.6 274.8,121.2 274.2,130.5 259.5,129.0 234.0,132.3 234.0,145.2 220.5,155.7 228.9,164.1 228.9,166.8 222.9,178.5 225.3,190.8 238.8,197.4 240.3,197.1 265.5,161.1 277.2,155.1',
    keywords:['kwazulu-natal','kwazulu natal','kzn','durban','pietermaritzburg','richards bay','newcastle','ladysmith','umhlanga','ballito','pinetown','chatsworth','phoenix','verulam','estcourt','vryheid','margate','port shepstone'],
    towns:{ 'durban':[227.2,157.8], 'pietermaritzburg':[226.6,155.5], 'richards bay':[249.4,138.5], 'newcastle':[233.0,151.9], 'ladysmith':[230.0,153.0], 'umhlanga':[232.4,153.8], 'ballito':[239.2,148.9], 'pinetown':[227.8,158.3], 'chatsworth':[229.3,159.8], 'phoenix':[229.0,154.5], 'verulam':[230.7,152.4], 'estcourt':[228.4,153.5], 'vryheid':[234.4,149.4], 'margate':[232.0,162.4], 'port shepstone':[231.6,161.8] } },
  { code:'WC', name:'Western Cape',
    points:'35.1,201.9 45.0,218.4 45.0,233.4 40.5,235.8 49.2,251.7 49.2,260.1 51.9,257.7 54.9,257.7 57.9,261.6 72.9,270.0 111.3,254.1 130.5,252.6 128.1,244.2 118.5,241.8 117.9,238.8 122.1,230.1 126.0,227.4 124.8,222.9 139.2,216.3 139.2,212.4 110.1,209.4 87.0,233.1 83.7,233.1 73.5,229.2 73.5,223.2 65.4,229.2 62.7,228.9 62.4,219.0 57.0,213.6 47.1,189.3',
    keywords:['western cape','cape town','kaapstad','stellenbosch','paarl','george','mossel bay','hermanus','worcester','bellville','somerset west','goodwood','parow','durbanville','milnerton','strand','knysna','oudtshoorn','vredenburg','beaufort west'],
    towns:{ 'cape town':[82.7,233.2], 'kaapstad':[82.7,233.2], 'stellenbosch':[82.7,233.2], 'paarl':[82.7,233.2], 'george':[104.5,230.4], 'mossel bay':[110.1,233.3], 'hermanus':[75.4,240.7], 'worcester':[82.7,233.2], 'bellville':[82.7,233.2], 'somerset west':[82.7,233.2], 'goodwood':[82.7,233.2], 'parow':[82.7,233.2], 'durbanville':[82.7,233.2], 'milnerton':[82.7,233.2], 'strand':[82.7,233.2], 'knysna':[116.6,233.3], 'oudtshoorn':[112.8,215.7], 'vredenburg':[82.7,233.2], 'beaufort west':[82.7,233.2] } },
  { code:'EC', name:'Eastern Cape',
    points:'238.2,199.5 223.2,192.0 221.1,179.7 211.8,182.1 205.5,191.7 202.8,191.7 194.1,185.1 183.9,190.2 163.2,190.2 163.2,199.5 142.2,211.2 140.7,218.1 126.9,224.1 127.8,228.9 124.2,231.0 120.0,240.0 129.6,242.4 132.6,252.6 149.1,255.6 154.5,252.3 161.7,252.3 165.0,248.1 176.1,248.1 204.3,231.6',
    keywords:['eastern cape','port elizabeth','gqeberha','east london','mthatha','uitenhage',"king william's town",'grahamstown','makhanda','queenstown','komani','butterworth','aliwal north','graaff-reinet','jeffreys bay','humansdorp'],
    towns:{ 'port elizabeth':[151.8,217.6], 'gqeberha':[151.8,217.6], 'east london':[177.3,207.5], 'mthatha':[165.1,201.9], 'uitenhage':[148.2,213.4], "king william's town":[168.2,200.8], 'grahamstown':[160.9,210.9], 'makhanda':[160.9,210.9], 'queenstown':[160.0,204.9], 'komani':[160.0,204.9], 'butterworth':[165.4,201.9], 'aliwal north':[157.6,207.1], 'graaff-reinet':[151.7,210.5], 'jeffreys bay':[140.9,224.4], 'humansdorp':[140.5,221.6] } },
];
SA_PROVINCES.forEach(p=>{
  const pts = p.points.split(' ').map(s=>s.split(',').map(Number));
  p.cx = pts.reduce((s,pt)=>s+pt[0],0) / pts.length;
  p.cy = pts.reduce((s,pt)=>s+pt[1],0) / pts.length;
});

// Prefer the province the user explicitly picked on the New Customer
// form (100% accurate) — only fall back to guessing from the free-text
// address for older customers created before that field existed.
function resolveProvince(profile){
  if(profile && profile.province) return profile.province;
  return guessProvince(profile && profile.address);
}
function guessProvince(address){
  const a = (address||'').toLowerCase().trim();
  if(!a) return null;
  for(const p of SA_PROVINCES){
    for(const kw of p.keywords){
      if(a.includes(kw)) return p.code;
    }
  }
  return null;
}

// ---------- Client map label positions (user-adjustable) ----------
// Labels default to each province's true centroid, but the user can
// drag them anywhere on the map in "Edit map" mode; positions persist
// locally so they stay put across sessions.
const SA_LABEL_OFFSETS_KEY = 'tracklend_sa_label_offsets';
let saLabelOffsets = {};
try { saLabelOffsets = JSON.parse(localStorage.getItem(SA_LABEL_OFFSETS_KEY)) || {}; } catch(e){ saLabelOffsets = {}; }
let saMapEditing = false;

function saLabelPos(p){
  const off = saLabelOffsets[p.code];
  return { x: p.cx + (off ? off.dx : 0), y: p.cy + (off ? off.dy : 0) };
}

function renderClientMap(list){
  const svg = document.getElementById('saMap');
  const note = document.getElementById('saMapNote');
  if(!svg) return;

  const names = Array.from(new Set(list.map(l=>l.customer)));
  const byProvince = {}; // code -> [names]
  let unmatched = 0;
  names.forEach(name=>{
    const profile = getCustomerProfile(name);
    const code = resolveProvince(profile);
    if(!code){ unmatched++; return; }
    (byProvince[code] = byProvince[code] || []).push(name);
  });

  let html = '';
  SA_PROVINCES.forEach(p=>{
    const has = !!byProvince[p.code];
    html += `<polygon points="${p.points}" class="sa-province${has?' has-clients':''}" data-code="${p.code}"/>`;
  });
  SA_PROVINCES.forEach(p=>{
    const has = !!byProvince[p.code];
    const pos = saLabelPos(p);
    html += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" class="sa-province-label${has?' has-clients':''}" data-code="${p.code}">${p.code}</text>`;
  });

  svg.innerHTML = html;
  svg.classList.toggle('editing', saMapEditing);
  svg.querySelectorAll('.sa-province.has-clients').forEach(el=>{
    const p = SA_PROVINCES.find(x=>x.code===el.dataset.code);
    const n = byProvince[el.dataset.code].length;
    el.addEventListener('mousemove', e=> showTooltip(e, `${p.name}: ${n} client${n>1?'s':''}`));
    el.addEventListener('mouseleave', hideTooltip);
  });

  if(saMapEditing){
    svg.querySelectorAll('.sa-province-label').forEach(el=> attachLabelDrag(el, svg));
  }

  if(note) note.textContent = unmatched ? `${unmatched} client${unmatched>1?'s':''} with an unrecognized address.` : '';
}

function attachLabelDrag(el, svg){
  el.addEventListener('mousedown', (downEvt)=>{
    downEvt.preventDefault();
    el.classList.add('dragging');
    const code = el.dataset.code;
    const p = SA_PROVINCES.find(x=>x.code===code);
    const pt = svg.createSVGPoint();

    function toSvgXY(evt){
      pt.x = evt.clientX; pt.y = evt.clientY;
      const ctm = svg.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : {x:p.cx, y:p.cy};
    }

    function onMove(moveEvt){
      const loc = toSvgXY(moveEvt);
      el.setAttribute('x', loc.x.toFixed(1));
      el.setAttribute('y', loc.y.toFixed(1));
      saLabelOffsets[code] = { dx: +(loc.x - p.cx).toFixed(1), dy: +(loc.y - p.cy).toFixed(1) };
    }
    function onUp(){
      el.classList.remove('dragging');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function initSaMapEditControls(){
  const editBtn = document.getElementById('saMapEditBtn');
  const editBar = document.getElementById('saMapEditBar');
  const resetBtn = document.getElementById('saMapResetBtn');
  const saveBtn = document.getElementById('saMapSaveBtn');
  if(!editBtn) return;

  editBtn.addEventListener('click', ()=>{
    saMapEditing = !saMapEditing;
    editBtn.classList.toggle('active', saMapEditing);
    editBtn.title = saMapEditing ? 'Editing — drag labels, then save' : 'Move the province labels';
    if(editBar) editBar.style.display = saMapEditing ? 'flex' : 'none';
    render();
  });

  if(resetBtn) resetBtn.addEventListener('click', ()=>{
    saLabelOffsets = {};
    render();
  });

  if(saveBtn) saveBtn.addEventListener('click', ()=>{
    try {
      localStorage.setItem(SA_LABEL_OFFSETS_KEY, JSON.stringify(saLabelOffsets));
      saMapEditing = false;
      editBtn.classList.remove('active');
      editBtn.title = 'Move the province labels';
      if(editBar) editBar.style.display = 'none';
      render();
    } catch(e){
      alert('Could not save label positions on this device.');
    }
  });
}
document.addEventListener('DOMContentLoaded', initSaMapEditControls);

function renderTopClients(list){
  const metric = prefs.clientsMetric||'principal';
  const names = Array.from(new Set(list.map(l=>l.customer)));
  const rows = names.map(name=>{
    const clientLoans = list.filter(l=>l.customer===name);
    let val;
    if(metric==='interest') val = clientLoans.reduce((s,l)=>s+l.interest,0);
    else if(metric==='count') val = clientLoans.length;
    else val = clientLoans.reduce((s,l)=>s+l.principal,0);
    return {name, val};
  }).sort((a,b)=>b.val-a.val).slice(0,8);
  const max = Math.max(...rows.map(r=>r.val), 1);
  const fmt = metric==='count' ? (v=>v.toLocaleString('en-ZA')+' loans') : fmtFull;
  document.getElementById('topClientsList').innerHTML = rows.map(r=>`
    <div class="top-row">
      <div class="top-row-head"><span class="top-row-name">${r.name}</span><span class="top-row-val">${fmt(r.val)}</span></div>
      <div class="top-bar-track"><div class="top-bar-fill" style="width:${Math.max(r.val/max*100,3)}%"></div></div>
    </div>`).join('') || `<div style="color:var(--muted);font-size:12.5px;">No clients yet.</div>`;
}

// "Christiaan Gower" -> "C. Gower". Middle names are dropped, so
// "Anna Marie van Wyk" becomes "A. van Wyk". Single-word names are left
// as they are.
// Recent loans shows the first name only — "Christiaan Gower" -> "Christiaan".
function firstNameOnly(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || '';
}
function shortCustomerName(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(parts.length < 2) return parts[0] || '';

  // Lowercase particles (van, de, du, der…) belong to the surname, not
  // the initials — "Anna Marie van Wyk" -> "A.M van Wyk".
  let i = parts.length - 1;
  while(i > 1 && /^[a-z]/.test(parts[i-1])) i--;
  const given   = parts.slice(0, i).filter(p=> /^[A-Z]/.test(p) || i === 1);
  const surname = parts.slice(i).join(' ');

  const initials = (given.length ? given : [parts[0]])
    .map(p=> p[0].toUpperCase()).join('.');
  // One name -> "C. Gower";  two or more -> "L.R Ambatore".
  return initials.length === 1
    ? `${initials}. ${surname}`
    : `${initials} ${surname}`;
}

function renderRecentLoans(list){
  // Both the Customers page and the Loans page carry a copy of this card.
  const bodies = document.querySelectorAll('[data-recent-loans]');
  if(!bodies.length) return;
  // Biggest loan first, not most recent. Ties fall back to newest.
  const recent = [...list]
    .sort((a,b)=> (Number(b.totalDue)||0) - (Number(a.totalDue)||0)
               || b.date.localeCompare(a.date)
               || b.id.localeCompare(a.id))
    .slice(0,5);
  // No 'R' prefix in this card, and thousands are separated by a space
  // instead of a comma — "128,500" -> "128 500". A non-breaking space so
  // the number can never wrap across two lines.
  const plainAmount = n => fmtFull(n).replace(/R/g, '').replace(/,/g, '\u00A0');
  const html = recent.map(l=>`
    <tr data-id="${l.id}">
      <td class="mini-id">${loanCode(l)}</td>
      <td class="mini-cust" title="${l.customer}">${firstNameOnly(l.customer)}</td>
      <td class="mini-amt"><span class="amt-val">${plainAmount(l.totalDue)}</span></td>
      <td class="mini-status"><span class="status-pill ${l.status}">${l.status}</span></td>
    </tr>`).join('') || `<tr><td colspan="4" style="color:var(--muted);text-align:center;padding:14px;">No loans yet.</td></tr>`;
  bodies.forEach(body=>{
    body.innerHTML = html;
    body.querySelectorAll('tr[data-id]').forEach(tr=> tr.addEventListener('click', ()=> openDetail(tr.dataset.id)));
  });
}

function renderActivityFeed(){
  // Rendered on the Customers page and the Loans page.
  const lists = document.querySelectorAll('[data-activity-feed]');
  if(!lists.length) return;
  const events = periodLoans().map(l=>{
    let type = 'created';
    if(l.status==='defaulted') type='default';
    else if(l.status==='settled') type='settled';
    else if(l.cycleType==='rollover') type='rollover';
    return {date:l.date, type, loan:l};
  }).sort((a,b)=> b.date.localeCompare(a.date));
  const top = events.slice(0,6);
  // Delta glyph on every row. Inline SVG rather than <i class="bx bx-delta">
  // — boxicons 2.1.4 (the version the app loads) has no bx-delta, and an
  // icon font wouldn't render in the offline/preview shell anyway.
  // Settled loans get a SOLID black triangle; everything else (new loans,
  // rollovers, defaults) keeps a white interior, so paid-back vs new is
  // readable at a glance. The outline variant fills with the card colour
  // rather than 'none' so the inside reads as deliberately empty.
  const deltaIconSvg = filled => `<svg class="activity-glyph ${filled ? 'is-filled' : 'is-hollow'}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : '#FFFFFF'}" stroke="currentColor" stroke-width="${filled ? 1.6 : 2.2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 4.5L21 19.5H3z"/>
    </svg>`;
  // Kept terse so the whole row fits on ONE line: verb, code, short name.
  const textFor = e => {
    const code = loanCode(e.loan);
    const who = shortCustomerName(e.loan.customer);
    if(e.type==='default')  return `${code} defaulted · ${who}`;
    if(e.type==='settled')  return `${code} settled · ${who}`;
    if(e.type==='rollover') return `${code} rolled over · ${who}`;
    return `${code} created · ${who}`;
  };
  const html = top.map(e=>{
    return `<div class="activity-item activity-item--oneline" title="${e.loan.customer}">
      <div class="activity-icon activity-icon--bare">${deltaIconSvg(e.type === 'settled')}</div>
      <div class="activity-text">${textFor(e)}</div>
      <div class="activity-time">${shortTimeAgoLabel(e.date)}</div>
    </div>`;
  }).join('') || `<div style="color:var(--muted);font-size:12.5px;">No recent activity.</div>`;
  lists.forEach(el=> el.innerHTML = html);
}

function cycleLabel(l){ return l.cycleType==='new' ? 'New' : `Rollover ${l.rolloverCount}/${prefs.maxRollovers}`; }

function renderTable(){
  if(!document.getElementById('tableView')) return; // table removed from dashboard; kanban-only now
  const list = tableScoped();
  document.getElementById('rowCount').textContent = `${list.length} loans`;
  document.querySelectorAll('#tableView th[data-sort]').forEach(th=>{
    th.textContent = th.textContent.replace(/ [▲▼]$/,'');
    if(th.dataset.sort===prefs.sort.field) th.textContent += prefs.sort.dir==='asc' ? ' ▲' : ' ▼';
  });
  document.getElementById('tableBody').innerHTML = list.map(l => {
    return `
    <tr data-id="${l.id}" class="${l.status==='rolled'?'is-rolled':''}">
      <td class="editable" data-field="customer">${l.customer}</td>
      <td>${cycleLabel(l)}</td>
      <td class="editable" data-field="principal">${moneySpan(l.principal)}</td>
      <td>${moneySpan(l.interest)}</td>
      <td>${moneySpan(l.totalDue)}</td>
      <td class="editable" data-field="date">${l.date}</td>
      <td><span class="status-pill ${l.status}">${l.status}</span></td>
      <td>
        <div class="row-actions">
          <button class="action-btn delete" data-act="delete" data-id="${l.id}">✕</button>
        </div>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:24px;">No loans match these filters.</td></tr>`;
}

function renderCustomizePop(){
  const input = document.getElementById('maxRolloverInput');
  if(input && document.activeElement !== input) input.value = prefs.maxRollovers;
}

/* ---------- rollover / settle / default actions ---------- */
function doRollover(id, askTiming=true){
  const loan = loans.find(l=>l.id===id); if(!loan || loan.status!=='active') return;
  if(loan.rolloverCount >= prefs.maxRollovers){
    alert(`This loan has reached the ${prefs.maxRollovers}-month rollover limit. It must be settled or defaulted.`);
    return;
  }
  let daysLate = 0;
  if(askTiming){
    const dl = promptDaysLate(); if(dl===null) return;
    daysLate = dl;
  }
  loan.status = 'rolled'; loan.daysLate = daysLate;
  const {interest, totalDue} = calcCycle(loan.principal);
  loans.push({
    id: genId(), customer: loan.customer, principal: loan.principal,
    interest, totalDue, cycleType:'rollover', rolloverCount: loan.rolloverCount+1,
    status:'active', date: todayStr(), notes:'', parentId: loan.id
  });
  saveLoans(loans); render();
}

/* ---------- detail modal ---------- */
function openDetail(id){
  const l = loans.find(x=>x.id===id); if(!l) return;
  editingId = id;
  document.getElementById('d_name').value = l.customer;
  document.getElementById('d_amount').value = l.principal;
  document.getElementById('d_cycleInfo').value = cycleLabel(l);
  document.getElementById('d_date').value = l.date;
  document.getElementById('d_status').value = l.status;
  refreshCustomSelect('d_status');
  document.getElementById('d_notes').value = l.notes || '';
  document.getElementById('d_daysLate').value = typeof l.daysLate==='number' ? l.daysLate : '';
  toggleDaysLateField();
  updatePreview('d_amount','d_preview');
  renderRiskPanel(l.customer, 'd_risk', 'd_name');
  const pill = document.getElementById('d_statusPill');
  pill.textContent = l.status; pill.className = 'status-pill '+l.status;
  document.getElementById('detailOverlay').classList.add('open');
}
function toggleDaysLateField(){
  const show = ['settled','rolled'].includes(document.getElementById('d_status').value);
  document.getElementById('d_daysLateField').style.display = show ? '' : 'none';
}
function updatePreview(inputId, previewId){
  const amount = Number(document.getElementById(inputId).value) || 0;
  const {interest, totalDue} = calcCycle(amount);
  document.getElementById(previewId).textContent = `Interest (${Math.round(INTEREST_RATE*100)}%): ${fmtFull(interest)} · Total due: ${fmtFull(totalDue)}`;
}

/* ---------- events ---------- */
document.getElementById('tableBody')?.addEventListener('click', e=>{
  const btn = e.target.closest('button[data-act]');
  if(btn){
    const id = btn.dataset.id, loan = loans.find(l=>l.id===id); if(!loan) return;
    if(btn.dataset.act==='settle'){
      alert('Loans are settled from the Customers page — open Customers, find ' + loan.customer + ' and press Paid.');
    }
    else if(btn.dataset.act==='rollover'){ doRollover(id); }
    else if(btn.dataset.act==='default'){ delete loan.daysLate; loan.status='defaulted'; saveLoans(loans); render(); }
    else if(btn.dataset.act==='delete'){
      const entered = window.prompt(`Enter the removal password for ${loan.customer}'s loan to delete it:`);
      if(entered===null) return;
      if(entered !== (loan.password||'')){
        alert('Incorrect password — loan was not deleted.');
        return;
      }
      loans = loans.filter(l=>l.id!==id); saveLoans(loans); render();
    }
    return;
  }
  const editable = e.target.closest('td.editable');
  if(editable){
    e.stopPropagation();
    const tr = editable.closest('tr'), id = tr.dataset.id, field = editable.dataset.field;
    const loan = loans.find(l=>l.id===id); if(!loan) return;
    const current = field==='principal' ? loan.principal : loan[field];
    const input = document.createElement('input');
    input.value = current; input.style.width='100%';
    input.type = field==='principal' ? 'number' : (field==='date'?'date':'text');
    editable.innerHTML=''; editable.appendChild(input); input.focus();
    const commit = ()=>{
      let v = input.value;
      if(field==='principal'){
        v = Number(v);
        if(!v || v<=0){ render(); return; }
        loan.principal = v;
        const {interest, totalDue} = calcCycle(v);
        loan.interest = interest; loan.totalDue = totalDue;
      } else loan[field] = v;
      saveLoans(loans); render();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', ev=>{ if(ev.key==='Enter') input.blur(); if(ev.key==='Escape') render(); });
    return;
  }
  const tr = e.target.closest('tr[data-id]');
  if(tr) openDetail(tr.dataset.id);
});

document.querySelectorAll('#tableView th[data-sort]').forEach(th=>{
  th.addEventListener('click', ()=>{
    const f = th.dataset.sort;
    if(prefs.sort.field===f) prefs.sort.dir = prefs.sort.dir==='asc'?'desc':'asc';
    else { prefs.sort.field=f; prefs.sort.dir='asc'; }
    savePrefs(); renderTable();
  });
});

// The top-nav search box is the only search in the app. On the Customers
// page it filters the customer list; everywhere else it drives the loans
// view (table/kanban + client scoping via Enter, as before).
document.getElementById('searchInput').addEventListener('input', ()=>{
  renderTable();
  if(currentPage==='customers') renderCustomers();
});

// Pressing Enter in the search bar jumps straight to that customer's
// scoped view — same effect as picking them from "Filter by client" —
// instead of just filtering the loans table/kanban as-you-type.
function applySearchAsClientFilter(inputEl){
  const q = inputEl.value.trim().toLowerCase();
  if(!q) return;
  const match = allCustomerNames().find(n=>n.toLowerCase()===q) ||
    allCustomerNames().find(n=>n.toLowerCase().startsWith(q));
  if(!match){
    alert(`No customer found matching "${inputEl.value.trim()}".`);
    return;
  }
  prefs.client = match;
  savePrefs();
  render();
}
document.getElementById('searchInput').addEventListener('keydown', e=>{
  if(e.key==='Enter') applySearchAsClientFilter(e.target);
});
document.getElementById('searchInput').addEventListener('input', e=>{
  if(!e.target.value.trim() && prefs.client!=='all'){ prefs.client='all'; savePrefs(); render(); }
});
/* Top-nav "New Loan" button (mockup-style top navigation bar) —
   forwards to the hero's #openModalBtn. */
document.getElementById('openModalBtnTop')?.addEventListener('click', ()=>{
  openLoanWizard();
});

document.getElementById('clientsMetricSelect')?.addEventListener('change', e=>{ prefs.clientsMetric = e.target.value; savePrefs(); render(); });

function jumpToDefaulted(){
  // #loansSection is long gone — Loans is a real page now.
  showPage('loans');
}
// Was bound to the old #navHelpBell alert-triangle button (since
// removed) — jumpToDefaulted is kept available in case it's wired back
// up later.

function setActiveNav(id){
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id===id));
  const ownPage = ['navSettings','navCustomers','navLoans','navExpenses','navFinance','navRisk'];
  if(!ownPage.includes(id)) showPage('dashboard');
}

/* ---------- page switching ---------- */
let currentPage = 'dashboard';
function showPage(page){
  currentPage = page;
  document.body.classList.toggle('page-expenses', page==='expenses');   // fixes the top nav on the Expenses page
  const map = { dashboard:'dashboardPage', settings:'settingsPage', customers:'customersPage', loans:'loansPage', expenses:'expensesPage', finance:'financePage', risk:'riskPage' };
  Object.entries(map).forEach(([name,id])=>{
    const el = document.getElementById(id);
    if(el) el.style.display = name===page ? '' : 'none';
  });
  // No per-page heading anymore — the topnav's active pill shows the page.
  if(page==='customers'){
    closeCustomerDetail();
  }
  if(page==='settings'){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navSettings'));
    setSettingsStatus('');
    if(typeof renderStorageUsage === 'function') renderStorageUsage();
    if(typeof renderBackupHistory === 'function') renderBackupHistory();
  }
  if(page==='customers'){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navCustomers'));
    renderCustomers();
    // The "Recent loans" / "Recent activity" filler cards live on this
    // page now (their render functions were left over from the old
    // dashboard layout).
    renderRecentLoans(periodLoans(clientScoped()));
    renderActivityFeed();
  }
  if(page==='loans'){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navLoans'));
    // Same two cards as the Customers page — the renderers fill every copy.
    renderRecentLoans(periodLoans(clientScoped()));
    renderActivityFeed();
    renderExposure();
    if(typeof amrHydrate === 'function') amrHydrate();
  }
  if(page==='expenses'){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navExpenses'));
    renderExpenses();
  }
  if(page==='finance'){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navFinance'));
    populateFinanceCustomerList();
    loadFinanceDocuments().then(startFinancePolling);
  }else{
    stopFinancePolling();
  }
  if(page==='risk'){
    document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navRisk'));
    populateRiskCustomerList();
  }
  document.querySelector('.main').scrollTo({top:0, behavior:'smooth'});
}
function showSettings(on){ showPage(on ? 'settings' : 'dashboard'); }
document.getElementById('notifyEmailInput').value = prefs.notifyEmail || '';
document.getElementById('notifyEmailInput').addEventListener('change', e=>{
  prefs.notifyEmail = e.target.value.trim(); savePrefs();
});

document.getElementById('maxRolloverInput').value = prefs.maxRollovers;
document.getElementById('maxRolloverInput').addEventListener('change', e=>{
  const v = Math.max(0, Math.min(24, Number(e.target.value)||0));
  prefs.maxRollovers = v; savePrefs(); render();
});

function initSettingsControls(){
  document.getElementById('notifyEmailInput').value = prefs.notifyEmail || '';
  document.getElementById('notifyNewLoan').checked = !!prefs.notifyEvents.newLoan;
  document.getElementById('notifyDueSoon').checked = !!prefs.notifyEvents.dueSoon;
  document.getElementById('notifyOverdue').checked = !!prefs.notifyEvents.overdue;
  document.getElementById('notifyDocUploaded').checked = !!prefs.notifyEvents.docUploaded;
  renderStorageUsage();
  renderBackupHistory();
}

[['notifyNewLoan','newLoan'],['notifyDueSoon','dueSoon'],['notifyOverdue','overdue'],['notifyDocUploaded','docUploaded']].forEach(([id,key])=>{
  document.getElementById(id).addEventListener('change', e=>{
    prefs.notifyEvents[key] = e.target.checked;
    savePrefs();
  });
});

/* ---------- storage usage ---------- */
function renderStorageUsage(){
  const el = document.getElementById('scStorageUsage');
  if(!el) return;
  let bytes = 0;
  try{
    bytes += JSON.stringify(loans || []).length;
    bytes += JSON.stringify(customerProfiles || []).length;
    bytes += JSON.stringify(expenses || []).length;
  }catch(_e){}
  const kb = bytes / 1024;
  el.textContent = kb < 1024 ? kb.toFixed(1) + ' KB' : (kb/1024).toFixed(2) + ' MB';
}

/* ---------- backup history ---------- */
function renderBackupHistory(){
  const wrap = document.getElementById('scBackupHistoryWrap');
  const list = document.getElementById('scBackupHistory');
  const lastEl = document.getElementById('scLastBackup');
  const history = prefs.backupHistory || [];
  if(!history.length){
    wrap.style.display = 'none';
    if(lastEl) lastEl.textContent = 'No backups yet — export one above.';
    return;
  }
  wrap.style.display = '';
  list.innerHTML = history.slice(-5).reverse().map(h=>
    `<div class="sc-backup-item"><span>${h.filename}</span><span>${new Date(h.date).toLocaleDateString('en-ZA')}</span></div>`
  ).join('');
  if(lastEl){
    const daysAgo = Math.floor((Date.now() - new Date(history[history.length-1].date)) / 86400000);
    lastEl.textContent = daysAgo === 0 ? 'Last backup: today.' : `Last backup: ${daysAgo} day${daysAgo===1?'':'s'} ago.`;
  }
}
function recordBackup(filename){
  prefs.backupHistory = prefs.backupHistory || [];
  prefs.backupHistory.push({ filename, date: new Date().toISOString() });
  prefs.backupHistory = prefs.backupHistory.slice(-20);
  savePrefs();
  renderBackupHistory();
}

/* ---------- passphrase strength meter (export modal) ---------- */
function passphraseStrength(pw){
  let score = 0;
  if(pw.length >= 8) score++;
  if(pw.length >= 12) score++;
  if(/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if(/[0-9]/.test(pw)) score++;
  if(/[^A-Za-z0-9]/.test(pw)) score++;
  return score; // 0-5
}
function updatePassphraseStrengthDisplay(pw){
  const score = passphraseStrength(pw);
  const fill = document.getElementById('ee_strengthFill');
  const label = document.getElementById('ee_strengthLabel');
  if(!pw){ fill.style.width='0%'; label.textContent=''; return; }
  const pct = Math.min(100, (score/5)*100);
  fill.style.width = pct + '%';
  if(score <= 1){ fill.style.background = 'var(--red)'; label.textContent = 'Weak'; }
  else if(score <= 3){ fill.style.background = '#eab308'; label.textContent = 'Okay'; }
  else { fill.style.background = 'var(--green)'; label.textContent = 'Strong'; }
}

// Generates a strong random passphrase locally (Web Crypto's CSPRNG) so the
// user never has to think one up — 20 characters drawn from a mixed
// alphabet, always guaranteed to hit every character class.
function generateStrongPassphrase(length = 20){
  const sets = [
    'abcdefghijkmnpqrstuvwxyz',
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    '23456789',
    '!@#$%^&*-_=+?'
  ];
  const all = sets.join('');
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  let chars = Array.from(bytes, b => all[b % all.length]);
  // Guarantee at least one character from each class.
  sets.forEach((set, i) => {
    const idxByte = crypto.getRandomValues(new Uint32Array(1))[0];
    chars[i] = set[idxByte % set.length];
  });
  // Shuffle so the guaranteed class characters aren't always in the same spots.
  for(let i = chars.length - 1; i > 0; i--){
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/* ---------- customers page ---------- */
function daysBetween(a,b){ return Math.round((a-b)/86400000); }
function autoDaysLate(loan){
  const due = loanDueDate(loan);
  const today = new Date(todayStr()+'T00:00:00');
  return daysBetween(today, due);
}
function timingLabel(dl){
  if(dl < 0) return `${Math.abs(dl)} day${Math.abs(dl)===1?'':'s'} early`;
  if(dl === 0) return 'on time';
  return `${dl} day${dl===1?'':'s'} late`;
}
// Folder icon — a plain white "Mac Finder" style folder (front + a
// slightly offset back panel standing in for a shadow, instead of the
// usual solid blue) so folders read clearly against the dark theme.
const FOLDER_SHAPE_PATH = 'M6 14c0-2.2 1.8-4 4-4h13l4.5 5H54c2.2 0 4 1.8 4 4v25c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V14z';
// Each folder carries its OWN <defs> gradient with a unique id. A single
// shared gradient defined elsewhere in the document is unreliable here —
// the customers page starts hidden (display:none), and referencing a
// url(#id) from another subtree can resolve to nothing, which is what
// made the folders render invisible.
let folderGradSeq = 0;
function folderIconSVG(flagged){
  const gid = 'folderGrad' + (++folderGradSeq);
  return `<div class="folder-icon-wrap">
    <div class="folder-card">
      <svg class="folder-svg" viewBox="0 6 64 44" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stop-color="#000000"/>
            <stop offset="38%"  stop-color="#1C1C20"/>
            <stop offset="68%"  stop-color="#3D3D44"/>
            <stop offset="88%"  stop-color="#5E5E68"/>
            <stop offset="100%" stop-color="#7A7A85"/>
          </linearGradient>
        </defs>
        <path class="folder-body-shape" fill="url(#${gid})" d="${FOLDER_SHAPE_PATH}"/>
      </svg>
    </div>
    ${flagged ? '<span class="folder-flag" title="Profile incomplete — open to finish setup">!</span>' : ''}
  </div>`;
}

function renderCustomers(){
  // Filtered by the top-nav search box (#searchInput) — the only search.
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const names = allCustomerNames()
    .filter(n=> !q || n.toLowerCase().startsWith(q))
    .sort((a,b)=>a.localeCompare(b));
  const wrap = document.getElementById('customerList');
  if(!wrap) return;
  if(!names.length){
    wrap.innerHTML = `<div class="customer-empty">No customers yet — add your first one with the <strong>New customer</strong> card beside this list.</div>`;
    return;
  }
  wrap.innerHTML = names.map(name=>{
    const cl = loans.filter(l=>l.customer===name);
    const open = cl.filter(l=>l.status==='active');
    const outstanding = open.reduce((s,l)=>s+l.totalDue,0);
    const complete = isCustomerComplete(getCustomerProfile(name));
    return `<div class="customer-folder" data-customer="${name}" title="${name}">
      ${folderIconSVG(!complete)}
      <div class="folder-label">${name}</div>
      <div class="folder-sub">${cl.length} loan${cl.length===1?'':'s'} · ${open.length ? fmtFull(outstanding)+' due' : 'no active loans'}</div>
    </div>`;
  }).join('');
}

document.getElementById('customerList')?.addEventListener('click', e=>{
  const folder = e.target.closest('.customer-folder');
  if(folder) openCustomerDetail(folder.dataset.customer);
});

/* ---------- customer detail (opens when a folder is clicked) ---------- */
let cd_currentCustomer = null;
// Tracks which loan checkboxes are ticked in the Loans tab, and which tab
// is active, so re-rendering the customer detail view (e.g. right after
// marking a loan paid) doesn't lose either — see openCustomerDetail below.
let cd_selectedLoanIds = new Set();

function openCustomerDetail(name, opts){
  const preserveTab = !!(opts && opts.preserveTab);
  // Only capture the currently-active tab when we're about to preserve it —
  // otherwise (opening a different/fresh customer) we always want Overview.
  const activeTab = preserveTab
    ? (document.querySelector('#cd_tabs .cd-tab.active')?.dataset.tab || 'overview')
    : 'overview';
  if(!preserveTab) cd_selectedLoanIds = new Set();
  cd_currentCustomer = name;
  const profile = getCustomerProfile(name);
  const complete = isCustomerComplete(profile);
  const cl = loans.filter(l=>l.customer===name).sort((a,b)=> b.date.localeCompare(a.date));
  const open = cl.filter(l=>l.status==='active');
  const outstanding = open.reduce((s,l)=>s+l.totalDue,0);
  const borrowed = cl.reduce((s,l)=>s+l.principal,0);
  const settled = cl.filter(l=>l.status==='settled');
  const repaid = settled.reduce((s,l)=>s+l.totalDue,0);
  const interestEarned = settled.reduce((s,l)=>s+l.interest,0);
  const a = assessRisk(name);

  document.getElementById('cd_name').textContent = name;
  document.getElementById('cd_id').textContent = 'Customer ID: ' + (profile.customerId || '—');
  document.getElementById('cd_phone').textContent = displayPhone(profile.phone) || '—';
  document.getElementById('cd_email').textContent = profile.email || '—';
  document.getElementById('cd_idNumber').textContent = profile.idNumber || '—';
  document.getElementById('cd_address').textContent = profile.address || '—';
  // Only show a pill when there's something to warn about — a complete,
  // low-risk customer gets a clean card with no badges at all.
  document.getElementById('cd_pills').innerHTML = complete ? '' :
    `<span class="cust-pill warn">Profile incomplete — cannot borrow yet</span>`;

  // Profile summary card
  const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join('') || '?';
  document.getElementById('cd_avatar').textContent = initials;
  document.getElementById('cd_profileSub').textContent = a.label ? a.label + ' risk' : 'Customer';
  document.getElementById('cd_summary').innerHTML = `
    <div class="customer-summary-stat"><div class="css-label">Amount borrowed</div><div class="css-value">${fmtFullRaw(borrowed)}</div></div>
    <div class="customer-summary-stat"><div class="css-label">Interest</div><div class="css-value">${fmtFullRaw(interestEarned)}</div></div>
    <div class="customer-summary-stat"><div class="css-label">Total repaid</div><div class="css-value">${fmtFullRaw(repaid)}</div></div>
    <div class="customer-summary-stat"><div class="css-label">Outstanding</div><div class="css-value">${fmtFullRaw(outstanding)}</div></div>`;

  // Active loans — each has a checkbox (for bulk marking) plus its own
  // one-click paid button. Checkboxes keep whatever the user had ticked
  // across a refresh (e.g. after marking one paid) via cd_selectedLoanIds.
  document.getElementById('cd_loansActive').innerHTML = open.length ? open.map(l=>`
    <div class="cd-loan-row">
      <input type="checkbox" class="cd-loan-checkbox" data-select-loan="${l.id}" ${cd_selectedLoanIds.has(l.id) ? 'checked' : ''} title="Select for bulk actions"/>
      <div class="cd-loan-bar"></div>
      <div class="cd-loan-main">
        <div class="cd-loan-title">${cycleLabel(l)}</div>
        <div class="cd-loan-sub">disbursed ${l.date}</div>
      </div>
      <div class="cd-loan-amt">${fmtFullRaw(l.totalDue)}</div>
      <button class="btn-paid" data-paid="${l.id}" title="Mark as paid">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
      </button>
    </div>`).join('') : '<div class="cd-loan-empty">No active loans.</div>';
  updateBulkPaidBtn();

  // Repaid (settled) loans — undoable in case a loan was marked paid by
  // mistake; puts it back into Active loans with no late/on-time record.
  document.getElementById('cd_loansSettled').innerHTML = settled.length ? settled.map(l=>`
    <div class="cd-loan-row">
      <div class="cd-loan-check">✓</div>
      <div class="cd-loan-main">
        <div class="cd-loan-title">${cycleLabel(l)}</div>
        <div class="cd-loan-sub">disbursed ${l.date}${typeof l.daysLate==='number' ? ' · paid '+timingLabel(l.daysLate) : ''}</div>
      </div>
      <div class="cd-loan-amt">${fmtFullRaw(l.totalDue)}</div>
      <button class="btn-undo-paid" data-unpaid="${l.id}" title="Undo — mark as active again">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
      </button>
    </div>`).join('') : '<div class="cd-loan-empty">No repaid loans yet.</div>';

  // Documents uploaded for this customer on the Finance page
  loadFinanceDocuments().then(()=>{
    if(cd_currentCustomer !== name) return; // moved on while loading
    const docs = financeDocs.filter(d=>d.customer===name);
    document.getElementById('cd_docs').innerHTML = docs.length ? docs.map(d=>`
      <div class="cd-doc-tile">
        <div class="cd-doc-tile-icon">${financeDocIcon(d.type)}</div>
        <div>
          <div class="cd-doc-tile-name">${d.name}</div>
          <div class="cd-doc-tile-date">${FINANCE_DOC_TYPES[d.type] || d.type}</div>
        </div>
      </div>`).join('') : '<div class="cd-doc-empty">No documents uploaded yet.</div>';
  });

  document.getElementById('cd_f_phone').value = profile.phone || '';
  document.getElementById('cd_f_email').value = profile.email || '';
  document.getElementById('cd_f_idNumber').value = profile.idNumber || '';
  document.getElementById('cd_f_address').value = profile.address || '';
  document.getElementById('cd_f_province').value = profile.province || '';
  document.getElementById('cd_f_notes').value = profile.notes || '';
  document.getElementById('cd_editFields').classList.remove('open');

  document.getElementById('customerListView').style.display = 'none';
  document.getElementById('customerDetailView').style.display = '';
  document.querySelectorAll('#cd_tabs .cd-tab').forEach(t=> t.classList.toggle('active', t.dataset.tab===activeTab));
  document.querySelectorAll('.cd-tabpanel').forEach(p=> p.style.display = (p.dataset.panel===activeTab) ? '' : 'none');
}
function closeCustomerDetail(){
  document.getElementById('customerDetailView').style.display = 'none';
  document.getElementById('customerListView').style.display = '';
  cd_currentCustomer = null;
  cd_selectedLoanIds = new Set();
}
document.getElementById('cd_backBtn')?.addEventListener('click', closeCustomerDetail);
document.querySelectorAll('#cd_tabs .cd-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('#cd_tabs .cd-tab').forEach(t=> t.classList.toggle('active', t===tab));
    document.querySelectorAll('.cd-tabpanel').forEach(p=> p.style.display = (p.dataset.panel===tab.dataset.tab) ? '' : 'none');
  });
});
document.getElementById('cd_editToggle')?.addEventListener('click', ()=>{
  document.getElementById('cd_editFields').classList.toggle('open');
});
document.getElementById('cd_saveBtn')?.addEventListener('click', ()=>{
  if(!cd_currentCustomer) return;
  const existing = getCustomerProfile(cd_currentCustomer);
  const profile = {
    customer: cd_currentCustomer,
    customerId: existing.customerId || genCustomerId(),
    createdAt: existing.createdAt || todayStr(),
    // The detail panel has no gender input — carry the saved value
    // through so editing a customer can't silently wipe it.
    gender: existing.gender || '',
    phone: formatZAPhone(document.getElementById('cd_f_phone').value),
    email: document.getElementById('cd_f_email').value.trim(),
    idNumber: document.getElementById('cd_f_idNumber').value.trim(),
    address: document.getElementById('cd_f_address').value.trim(),
    province: document.getElementById('cd_f_province').value,
    notes: document.getElementById('cd_f_notes').value.trim()
  };
  upsertCustomerProfile(profile).then(()=>{
    const badge = document.getElementById('cd_savedBadge');
    badge.classList.add('show'); setTimeout(()=>badge.classList.remove('show'), 1600);
    openCustomerDetail(cd_currentCustomer);
    renderCustomers();
    populateCustomerSelect();
  });
});
document.getElementById('cd_removeBtn')?.addEventListener('click', ()=>{
  if(!cd_currentCustomer) return;
  const hasActiveLoans = loans.some(l=>l.customer===cd_currentCustomer && l.status==='active');
  if(hasActiveLoans){
    alert(`${cd_currentCustomer} still has an active loan — settle it (mark it Paid) before removing this customer.`);
    return;
  }
  if(!confirm(`Remove ${cd_currentCustomer} from your customer list? Their loan history stays on record, but you won't be able to lend to them again until they're re-added.`)) return;
  customerProfiles = customerProfiles.filter(p=>p.customer!==cd_currentCustomer);
  saveCustomerProfiles(customerProfiles).then(()=>{
    closeCustomerDetail();
    renderCustomers();
    populateCustomerSelect();
  });
});
/* ---------- new customer creation ---------- */
// Auto-fill from documents already uploaded on the Finance page: the
// operator tags an ID/proof-of-address upload with the new customer's
// name there (before the customer even exists — Finance's Customer
// field is free text), OCR + heuristic parsing runs in the background,
// and typing that same name here pulls in whatever it found. Only
// fills fields that are still empty, so it never overwrites something
// already typed, and only fills once enough of the name is typed to
// get an exact, case-insensitive match.
let nc_autofillDebounce = null;

async function tryAutoFillNewCustomer(){
  const typed = document.getElementById('nc_name').value.trim();
  if(typed.length < 3) return;
  let docs = [];
  try{
    const resp = await authFetch('/api/finance/documents-by-customer?customer=' + encodeURIComponent(typed));
    if(resp.ok) docs = await resp.json();
  } catch(_err){ return; }
  if(!docs.length) return;

  const idField = document.getElementById('nc_idNumber');
  const addrField = document.getElementById('nc_address');
  const phoneField = document.getElementById('nc_phone');
  for(const doc of docs){
    if(doc.extractedIdNumber && !idField.value.trim()) idField.value = doc.extractedIdNumber;
    if(doc.extractedAddress && !addrField.value.trim()) addrField.value = doc.extractedAddress;
    if(doc.extractedPhone && !phoneField.value.trim()) phoneField.value = doc.extractedPhone;
  }
}
document.getElementById('nc_name')?.addEventListener('input', ()=>{
  clearTimeout(nc_autofillDebounce);
  nc_autofillDebounce = setTimeout(tryAutoFillNewCustomer, 400);
});

/* ─────────────────────────────────────────────────────────────
   New customer — a 3-step card that lives beside the customer
   list (it replaced the old #newCustomerOverlay modal).
     1. Details  — name, phone, email
     2. Address  — ID number, address, province
     3. Review   — confirm, add notes, save
   ───────────────────────────────────────────────────────────── */
const NCA_TOTAL_STEPS = 3;
let nca_step = 1;

function nca_fields(){
  return {
    name:     (document.getElementById('nc_name')?.value || '').trim(),
    gender:   document.getElementById('nc_gender')?.value || '',
    phone:    (document.getElementById('nc_phone')?.value || '').trim(),
    email:    (document.getElementById('nc_email')?.value || '').trim(),
    idNumber: (document.getElementById('nc_idNumber')?.value || '').trim(),
    address:  (document.getElementById('nc_address')?.value || '').trim(),
    province: document.getElementById('nc_province')?.value || '',
    notes:    (document.getElementById('nc_notes')?.value || '').trim()
  };
}

function nca_setError(msg){
  const el = document.getElementById('nca_error');
  if(el) el.textContent = msg || '';
}

// Each step only lets you move on once its own fields are filled in.
function nca_validateStep(step){
  const f = nca_fields();
  // Only name + phone are genuinely required. Email, ID number and
  // street address are optional here — a customer saved without them is
  // flagged "incomplete" (red ! on their folder) until they're filled in.
  if(step === 1){
    if(!f.name)   return 'Enter the customer\'s full name.';
    // Required: automated emails address the customer by title.
    if(!f.gender) return 'Select the customer\'s gender.';
    if(!f.phone)  return 'Enter a phone number.';
    // Validated only when something was actually typed.
    if(f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email))
      return 'That email address doesn\'t look right.';
    if(customerProfiles.some(p=>p.customer.trim().toLowerCase() === f.name.toLowerCase()))
      return 'A customer with this name already exists.';
  }
  if(step === 2){
    if(!f.province) return 'Pick a province.';
  }
  return '';
}

const NCA_PROVINCES = { GP:'Gauteng', WC:'Western Cape', EC:'Eastern Cape', KZN:'KwaZulu-Natal',
  FS:'Free State', NW:'North West', MP:'Mpumalanga', LP:'Limpopo', NC:'Northern Cape' };

function nca_renderReview(){
  const el = document.getElementById('nca_review');
  if(!el) return;
  const f = nca_fields();
  const rows = [
    ['Full name', f.name],
    ['Gender', f.gender],
    ['Phone', f.phone],
    ['Email', f.email],
    ['ID number', f.idNumber],
    ['Address', f.address],
    ['Province', NCA_PROVINCES[f.province] || '—']
  ];
  el.innerHTML = rows.map(([k,v])=>
    `<div class="nca-review-row"><span class="nca-review-key">${k}</span>` +
    (v ? `<span class="nca-review-val">${v}</span>`
       : `<span class="nca-review-val nca-review-missing">Not provided</span>`) +
    `</div>`
  ).join('');

  // Warn up front that saving with blanks flags the customer.
  const missing = rows.filter(([,v])=> !v).length;
  const note = document.getElementById('nca_reviewNote');
  if(note){
    note.style.display = missing ? '' : 'none';
    note.textContent = missing
      ? `${missing} field${missing===1?'':'s'} left blank — this customer will be flagged as incomplete until they're filled in.`
      : '';
  }
}

function nca_goToStep(step){
  nca_step = Math.min(NCA_TOTAL_STEPS, Math.max(1, step));
  nca_setError('');

  document.querySelectorAll('#customersAddCard .nca-panel').forEach(p=>{
    p.classList.toggle('active', +p.dataset.panel === nca_step);
  });
  document.querySelectorAll('#customersAddCard .nca-step').forEach(s=>{
    const n = +s.dataset.step;
    s.classList.toggle('active', n === nca_step);
    s.classList.toggle('done', n < nca_step);
  });

  const fill = document.getElementById('nca_progressFill');
  if(fill) fill.style.width = (nca_step / NCA_TOTAL_STEPS * 100) + '%';
  const count = document.getElementById('nca_stepCount');
  if(count) count.textContent = `Step ${nca_step} of ${NCA_TOTAL_STEPS}`;

  const backBtn = document.getElementById('nca_backBtn');
  const nextBtn = document.getElementById('nca_nextBtn');
  const saveBtn = document.getElementById('nca_saveBtn');
  if(backBtn) backBtn.style.visibility = nca_step === 1 ? 'hidden' : 'visible';
  if(nextBtn) nextBtn.style.display = nca_step === NCA_TOTAL_STEPS ? 'none' : '';
  if(saveBtn) saveBtn.style.display = nca_step === NCA_TOTAL_STEPS ? '' : 'none';

  if(nca_step === NCA_TOTAL_STEPS) nca_renderReview();
}

function nca_reset(){
  document.getElementById('newCustomerForm')?.reset();
  nca_goToStep(1);
}

// Kept for the loan wizard's "create a customer first" shortcut, which
// used to open the modal — it now just focuses the card's first step.
function openNewCustomerModal(){
  showPage('customers');
  nca_goToStep(1);
  document.getElementById('customersAddCard')?.scrollIntoView({ behavior:'smooth', block:'nearest' });
  setTimeout(()=> document.getElementById('nc_name')?.focus(), 200);
}

document.getElementById('nca_nextBtn')?.addEventListener('click', ()=>{
  const err = nca_validateStep(nca_step);
  if(err){ nca_setError(err); return; }
  nca_goToStep(nca_step + 1);
});
document.getElementById('nca_backBtn')?.addEventListener('click', ()=> nca_goToStep(nca_step - 1));

// Enter moves to the next step instead of submitting a half-filled form.
document.getElementById('newCustomerForm')?.addEventListener('keydown', e=>{
  if(e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && nca_step < NCA_TOTAL_STEPS){
    e.preventDefault();
    document.getElementById('nca_nextBtn')?.click();
  }
});

// Normalise to +27 as soon as the user leaves the field, so they can see
// it happen rather than only finding out once the customer is saved.
document.getElementById('nc_phone')?.addEventListener('blur', e=>{ e.target.value = formatZAPhone(e.target.value); });
document.getElementById('cd_f_phone')?.addEventListener('blur', e=>{ e.target.value = formatZAPhone(e.target.value); });

document.getElementById('newCustomerForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  // Re-check every step, not just the last one — fields can be edited
  // after passing validation by stepping back.
  for(let s = 1; s <= NCA_TOTAL_STEPS; s++){
    const err = nca_validateStep(s);
    if(err){ nca_goToStep(s); nca_setError(err); return; }
  }
  const f = nca_fields();
  const profile = {
    customer: f.name, customerId: genCustomerId(), createdAt: todayStr(),
    gender: f.gender,
    phone: formatZAPhone(f.phone), email: f.email, idNumber: f.idNumber,
    address: f.address, province: f.province, notes: f.notes
  };
  customerProfiles.push(profile);
  saveCustomerProfiles(customerProfiles).then(()=>{
    nca_reset();
    renderCustomers();
    renderActivityFeed();
    populateCustomerSelect();
  });
});

nca_goToStep(1);

/* ---------- Top borrowers by exposure (Loans page) ---------- */
// Exposure = everything a customer still owes: the total due on every
// loan that hasn't been settled. Rolled-over loans still count — the
// money is still out. Settled ones don't.
// Biggest borrowers THIS MONTH — totals the loans taken out in the
// current calendar month, whatever their status. Not the outstanding
// balance: this is who took the most money this month.
function customerExposure(){
  const map = new Map();
  periodLoans()
    .forEach(l=>{
      const key = String(l.customer || '').trim();
      if(!key) return;
      const row = map.get(key) || { customer:key, owed:0, count:0, overdue:0, defaulted:0 };
      row.owed += Number(l.totalDue) || 0;
      row.count += 1;
      if(l.status === 'defaulted') row.defaulted += 1;
      else if(l.status !== 'settled' && loanDueDate(l) < new Date(todayStr()+'T00:00:00')) row.overdue += 1;
      map.set(key, row);
    });
  return [...map.values()].sort((a,b)=> b.owed - a.owed);
}

function renderExposure(){
  const el = document.getElementById('exposureList');
  if(!el) return;
  const rows = customerExposure();
  if(!rows.length){
    el.innerHTML = `<div class="expo-empty">No loans issued in this period.</div>`;
    return;
  }
  // Exactly the top 5 — the card never scrolls.
  const top = rows.slice(0, 5);
  const max = top[0].owed || 1;

  // Small head-and-shoulders avatar, same line weight as the rest of the UI.
  const avatar = `<svg class="expo-avatar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10.2"/>
      <circle cx="12" cy="9.6" r="3.1"/>
      <path d="M6.2 19.1a6.2 6.2 0 0 1 11.6 0"/>
    </svg>`;

  el.innerHTML = `<div class="expo-chart">` + top.map(r=>{
    // Scale to the biggest borrower; floor it so a small debt still shows.
    const pct = Math.max(12, Math.round((r.owed / max) * 100));
    const amount = fmtFullRaw(r.owed).replace(/R/g,'').replace(/,/g,'\u00A0');
    const flagCls = r.defaulted ? ' is-default' : (r.overdue ? ' is-late' : '');
    return `<div class="expo-col${flagCls}" data-customer="${r.customer}" title="${r.customer} — ${fmtFullRaw(r.owed)} across ${r.count} loan${r.count===1?'':'s'} this month${r.defaulted ? ' · in default' : (r.overdue ? ` · ${r.overdue} overdue` : '')}">
      <div class="expo-avatar-wrap">${avatar}</div>
      <div class="expo-col-amt">${amount}</div>
      <div class="expo-col-track"><div class="expo-col-bar" style="height:${pct}%"></div></div>
      <div class="expo-col-name">${initialsFor(r.customer)}</div>
    </div>`;
  }).join('') + `</div>`;

  el.querySelectorAll('[data-customer]').forEach(col=>{
    col.addEventListener('click', ()=>{
      showPage('customers');
      if(typeof openCustomerDetail === 'function') openCustomerDetail(col.dataset.customer);
    });
  });
}

// "Christiaan Gower" -> "C.G",  "Lindiwe Rose Ambatore" -> "L.A"
function initialsFor(name){
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '';
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  const first = parts[0][0];
  const last  = parts[parts.length-1][0];
  return `${first.toUpperCase()}.${last.toUpperCase()}`;
}

/* ---------- Automated Monthly Reminders (Loans page) ---------- */
// Fixed wording — not user-editable. The automated-message disclosure is
// part of the template so it goes out on every reminder.
const AMR_DEFAULT_TEMPLATE = "Hi {name}, a friendly reminder that your payment of {amount} for loan {loan} is due on {due}. Please keep in mind that this message is automated. — TrackLend";

// TrackLend's WhatsApp Business App number. Messages are composed from
// this account on the device — the Business App has no API, so sending
// is a manual tap (see REMINDERS-SETUP.md).
const TRACKLEND_WA_NUMBER = '+27795719941';
const TRACKLEND_WA_DISPLAY = '+27 79 571 9941';

function amrSettings(){
  const s = Object.assign({}, prefs.autoReminders || {});
  // WhatsApp-only, fixed wording, no schedule — reminders are sent on
  // demand, so these are constants rather than saved settings.
  s.email = false;
  s.whatsapp = true;
  s.template = AMR_DEFAULT_TEMPLATE;
  return s;
}

// Pull the live control values back out of the card.
// The card has no channel or schedule controls any more — WhatsApp only,
// sent when you choose to send.
function amrReadForm(){
  return { email:false, whatsapp:true, template:AMR_DEFAULT_TEMPLATE };
}

function amrSave(){
  savePrefs();
  amrRenderQueue();
}

// Push saved settings into the controls (called when the page opens).
function amrHydrate(){
  // Read-only element — show the fixed wording as text.
  const tpl = document.getElementById('amr_template');
  if(tpl) tpl.textContent = AMR_DEFAULT_TEMPLATE;
  amrRenderQueue();
  amrLoadQueue();
}

// Every active loan with a payment still to come, soonest first. There's
// no schedule any more — you send when you want, so this is simply the
// list of who could be reminded.
// getCustomerProfile() matches the name EXACTLY, so a loan saved as
// "Christiaan Gower " or with different casing than the profile finds
// nothing and the reminder reports "no WhatsApp number". Match the same
// loose way customerLoans() does.
function amrProfileFor(name){
  const key = String(name || '').trim().toLowerCase();
  if(!key) return {};
  return customerProfiles.find(p=> String(p.customer||'').trim().toLowerCase() === key) || {};
}

function amrUpcoming(){
  const s = amrReadForm();
  const today = new Date(); today.setHours(0,0,0,0);
  return loans
    .filter(l=> l.status === 'active')
    .map(l=>{
      const due = loanDueDate(l);
      const profile = amrProfileFor(l.customer);
      return {
        loan: l, due,
        daysToDue: Math.round((due - today) / 86400000),
        email: (profile.email || '').trim(),
        // Normalise to +27 form — older records may hold "082…" or a
        // number typed with spaces/brackets.
        phone: profile.phone ? formatZAPhone(profile.phone) : ''
      };
    })
    .filter(r=> r.daysToDue >= 0)
    .sort((a,b)=> a.due - b.due);
}

// Reminders whose send date has arrived (or slipped past) and that
// haven't gone out yet this month.
// Kept as the "haven't been reminded in the last day" subset, so a
// double-click on Send all doesn't message everyone twice.
function amrDueNow(){
  return amrUpcoming().filter(r=> !amrAlreadySent(r.loan));
}

// Send history: { loanId: 'ISO timestamp of the last reminder' }. This
// replaced a once-per-calendar-month lock — reminders can now go out
// whenever you like, and history is advisory rather than a hard block.
function amrHistory(){
  const h = prefs.reminderHistory;
  return (h && typeof h === 'object' && !Array.isArray(h)) ? h : {};
}
function amrLastSent(loan){
  const iso = amrHistory()[loan.id];
  return iso ? new Date(iso) : null;
}
// Hours since the last reminder for this loan, or null if never sent.
function amrHoursSince(loan){
  const last = amrLastSent(loan);
  return last ? (Date.now() - last.getTime()) / 3600000 : null;
}
// Only used to keep the automatic "due now" batch from repeating itself
// on the same day. Manual sends ignore this entirely.
function amrAlreadySent(loan){
  const hrs = amrHoursSince(loan);
  return hrs !== null && hrs < 20;
}
function amrMarkSent(loan){
  const h = amrHistory();
  h[loan.id] = new Date().toISOString();
  prefs.reminderHistory = h;
}
// "never", "2h ago", "3d ago"
function amrLastSentLabel(loan){
  const hrs = amrHoursSince(loan);
  if(hrs === null) return 'Not sent yet';
  if(hrs < 1)  return 'Sent just now';
  if(hrs < 24) return `Sent ${Math.round(hrs)}h ago`;
  const d = Math.round(hrs/24);
  return `Sent ${d}d ago`;
}

function amrFillTemplate(tpl, r){
  return String(tpl)
    .replace(/\{name\}/g,   firstNameOnly(r.loan.customer) || r.loan.customer)
    .replace(/\{amount\}/g, fmtFull(r.loan.totalDue))
    .replace(/\{due\}/g,    r.due.toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' }))
    .replace(/\{loan\}/g,   loanCode(r.loan));
}

function amrRenderQueue(){
  const el = document.getElementById('amr_queue');
  if(!el) return;
  const s = amrReadForm();
  const rows = amrUpcoming().slice(0, 12);

  if(!rows.length){
    el.innerHTML = `<div class="amr-q-empty">No active loans with an upcoming payment.</div>`;
    return;
  }
  el.innerHTML = rows.map(r=>{
    const when = r.daysToDue === 0 ? 'Due today'
               : r.daysToDue === 1 ? 'Due tomorrow'
               : `Due in ${r.daysToDue}d`;
    // A channel is only usable if we actually hold that contact detail.
    const tags = [`<span class="amr-q-tag ${r.phone ? '' : 'is-missing'}" title="${r.phone || 'No phone on file'}">WA</span>`];
    const last = amrLastSentLabel(r.loan);
    // Any row can be sent right now, regardless of its schedule.
    return `<div class="amr-q-item is-clickable" data-loan-id="${r.loan.id}" title="${r.loan.customer} — ${last}. Click to send now.">
      <span class="amr-q-name">${shortCustomerName(r.loan.customer)}</span>
      <span class="amr-q-ch">${tags.join('')}</span>
      <span class="amr-q-when">${when}</span>
      <span class="amr-q-send" aria-hidden="true">Send</span>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-loan-id]').forEach(row=>{
    row.addEventListener('click', ()=> amrSendOne(row.dataset.loanId));
  });
}

// Send a single customer's reminder immediately, ignoring the schedule
// and whether one already went out today.
async function amrSendOne(loanId){
  const r = amrUpcoming().find(x=> x.loan.id === loanId);
  if(!r){ amrStatus('That loan is no longer active.', 'err'); return; }
  const s = amrReadForm();
  const body = amrFillTemplate(s.template, r);
  const item = {
    loanId: r.loan.id, customer: r.loan.customer,
    phone: r.phone || '', email: r.email || '', body,
    subject: `Payment reminder — ${loanCode(r.loan)} due ${r.due.toLocaleDateString('en-ZA')}`,
    emailSent: false
  };

  // Drop this one at the front of the queue and open it straight away.
  const existing = amrQueue.findIndex(q=> q.loanId === item.loanId);
  if(existing >= 0) amrQueue[existing] = item; else amrQueue.unshift(item);
  amrPersistQueue();
  amrQueueIdx = amrQueue.findIndex(q=> q.loanId === item.loanId);
  document.getElementById('amrQueueOverlay')?.classList.add('open');
  amrRenderQueueStep();
}

function amrStatus(msg, kind){
  const el = document.getElementById('amr_status');
  if(!el) return;
  el.textContent = msg;
  el.className = 'amr-status' + (kind ? ' is-' + kind : '');
}

// Send everything that's due. Email goes through the existing
// /api/notify endpoint; WhatsApp has no server route yet, so those are
// handed to wa.me links (see the note shown to the user).
// ---- persistent send queue ----
// Due reminders are saved to prefs, so closing the app mid-way doesn't
// lose them — reopen and carry on exactly where you left off.
let amrQueue = [];      // [{loanId, customer, phone, email, body, subject, emailSent}]
let amrQueueIdx = 0;

function amrLoadQueue(){
  const saved = prefs.reminderQueue;
  amrQueue = Array.isArray(saved && saved.items) ? saved.items : [];
  amrQueueIdx = 0;
  // Items queued before the lookup fix may hold a blank phone/email even
  // though the profile has one — re-resolve contact details on load.
  let changed = false;
  amrQueue.forEach(item=>{
    const p = amrProfileFor(item.customer);
    const phone = p.phone ? formatZAPhone(p.phone) : '';
    const email = (p.email || '').trim();
    if(phone !== item.phone){ item.phone = phone; changed = true; }
    if(email !== item.email){ item.email = email; changed = true; }
  });
  if(changed) amrPersistQueue();
  amrUpdateBadge();
}
function amrPersistQueue(){
  prefs.reminderQueue = { items: amrQueue, savedAt: todayStr() };
  savePrefs();
  amrUpdateBadge();
}
function amrUpdateBadge(){
  const badge = document.getElementById('amr_waitingBadge');
  if(!badge) return;
  const n = amrQueue.length;
  badge.textContent = n;
  badge.style.display = n ? '' : 'none';
}

// Build the queue from everything due, merging with anything still
// waiting from a previous session (no duplicates).
function amrBuildQueue(all){
  const s = amrReadForm();
  // all = true -> every upcoming payment, ignoring the schedule and any
  // reminder already sent. Used by "Send all now".
  const due = all ? amrUpcoming() : amrDueNow();
  due.forEach(r=>{
    if(amrQueue.some(q=> q.loanId === r.loan.id)) return;
    const body = amrFillTemplate(s.template, r);
    amrQueue.push({
      loanId: r.loan.id,
      customer: r.loan.customer,
      phone: r.phone || '',
      email: r.email || '',
      body,
      subject: `Payment reminder — ${loanCode(r.loan)} due ${r.due.toLocaleDateString('en-ZA')}`,
      emailSent: false
    });
  });
  amrPersistQueue();
}

// Entry point from the card's button.
async function amrSendDue(all){
  amrBuildQueue(all === true);
  if(!amrQueue.length){
    amrStatus('No active loans with an upcoming payment.', 'ok');
    return;
  }

  amrOpenQueue();
}

function amrOpenQueue(){
  if(!amrQueue.length){ amrStatus('Nothing waiting to send.', 'ok'); return; }
  amrQueueIdx = 0;
  document.getElementById('amrQueueOverlay')?.classList.add('open');
  amrRenderQueueStep();
}
function amrCloseQueue(){
  document.getElementById('amrQueueOverlay')?.classList.remove('open');
  amrRenderQueue();
  const left = amrQueue.length;
  amrStatus(left ? `${left} reminder${left===1?'':'s'} still waiting — reopen any time.`
                 : 'All reminders sent.', left ? '' : 'ok');
}

function amrRenderQueueStep(){
  if(!amrQueue.length){ amrCloseQueue(); return; }
  if(amrQueueIdx >= amrQueue.length) amrQueueIdx = 0;
  const item = amrQueue[amrQueueIdx];
  const total = amrQueue.length;

  const set = (id, txt)=>{ const el = document.getElementById(id); if(el) el.textContent = txt; };
  set('amr_qmProgress', `Reminder ${amrQueueIdx+1} of ${total}`);
  set('amr_qmName', item.customer);
  set('amr_qmMeta', item.phone ? displayPhone(item.phone) : 'No phone number on file');
  set('amr_qmMsg', item.body);

  const fill = document.getElementById('amr_qmFill');
  if(fill) fill.style.width = `${Math.round((amrQueueIdx/total)*100)}%`;

  const ch = document.getElementById('amr_qmChannels');
  if(ch){
    const loan = loans.find(l=> l.id === item.loanId);
    const last = loan ? amrLastSentLabel(loan) : 'Not sent yet';
    ch.innerHTML = (item.phone
      ? `<span class="amr-qm-tag">WhatsApp — send below</span>`
      : `<span class="amr-qm-tag is-missing">No WhatsApp number</span>`)
      + `<span class="amr-qm-tag">${last}</span>`;
  }

  // Without a number there's nothing to send, so the WhatsApp and
  // "Mark sent" actions are hidden entirely — only Skip and Add number
  // remain, so a reminder can never be marked sent when it couldn't go.
  const openBtn = document.getElementById('amr_qmOpen');
  if(openBtn) openBtn.style.display = item.phone ? '' : 'none';
  const nextBtn = document.getElementById('amr_qmNext');
  if(nextBtn) nextBtn.style.display = item.phone ? '' : 'none';
  const fixBtn = document.getElementById('amr_qmFix');
  if(fixBtn) fixBtn.style.display = item.phone ? 'none' : '';
}

// Jump to the customer's profile so the phone number can be added.
function amrFixNumber(){
  const item = amrQueue[amrQueueIdx];
  if(!item) return;
  amrCloseQueue();
  showPage('customers');
  if(typeof openCustomerDetail === 'function') openCustomerDetail(item.customer);
}

function amrOpenWhatsApp(){
  const item = amrQueue[amrQueueIdx];
  if(!item || !item.phone) return;
  window.open(`https://wa.me/${item.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(item.body)}`, '_blank');
}

// Done with this one — drop it from the queue and show the next.
function amrMarkSentNext(){
  const item = amrQueue[amrQueueIdx];
  if(item && !item.phone){
    amrStatus('No WhatsApp number on file — add one first.', 'err');
    return;
  }
  if(item){
    const loan = loans.find(l=> l.id === item.loanId);
    if(loan) amrMarkSent(loan);
    amrQueue.splice(amrQueueIdx, 1);
  }
  amrPersistQueue();
  if(!amrQueue.length){ amrCloseQueue(); return; }
  if(amrQueueIdx >= amrQueue.length) amrQueueIdx = 0;
  amrRenderQueueStep();
}

// Leave it in the queue, just move along.
function amrSkipCurrent(){
  if(amrQueue.length < 2){ amrCloseQueue(); return; }
  amrQueueIdx = (amrQueueIdx + 1) % amrQueue.length;
  amrRenderQueueStep();
}

function amrPreview(){
  const s = amrReadForm();
  const next = amrUpcoming()[0];
  if(!next){ amrStatus('No upcoming payment to preview.', 'err'); return; }
  alert(amrFillTemplate(s.template, next));
}

// wiring
document.getElementById('amr_sendAllBtn')?.addEventListener('click', ()=>{
  const n = amrUpcoming().length;
  if(!n){ amrStatus('No active loans with an upcoming payment.', 'ok'); return; }
  if(confirm(`Send a reminder to all ${n} customer${n===1?'':'s'} with an upcoming payment now?`)) amrSendDue(true);
});
document.getElementById('amr_qmClose')?.addEventListener('click', amrCloseQueue);
document.getElementById('amr_qmSkip')?.addEventListener('click', amrSkipCurrent);
document.getElementById('amr_qmOpen')?.addEventListener('click', amrOpenWhatsApp);
document.getElementById('amr_qmNext')?.addEventListener('click', amrMarkSentNext);
document.getElementById('amr_qmFix')?.addEventListener('click', amrFixNumber);
document.getElementById('amrQueueOverlay')?.addEventListener('click', e=>{
  if(e.target.id === 'amrQueueOverlay') amrCloseQueue();
});
document.getElementById('amr_previewBtn')?.addEventListener('click', amrPreview);

/* ---------- expenses page ---------- */
// Simple black-and-white line icons (no per-category color) so the
// expense UI stays monochrome and matches the rest of the theme.
const EXPENSE_CATEGORIES = [
  { key:'Rent',      icon:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>' },
  { key:'Salaries',  icon:'<circle cx="9" cy="8" r="3"/><path d="M2 21v-1a6 6 0 0 1 12 0v1"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M22 21v-1a5 5 0 0 0-4-4.9"/>' },
  { key:'Transport', icon:'<path d="M3 13l1.5-5A2 2 0 0 1 6.4 6.5h11.2A2 2 0 0 1 19.5 8l1.5 5"/><rect x="2.5" y="13" width="19" height="5" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/>' },
  { key:'Utilities', icon:'<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.6.5 1 1.3 1 2.1V15h6v-.4c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 2z"/>' },
  { key:'Marketing', icon:'<path d="M3 11v2a2 2 0 0 0 2 2h1l3 5V4L6 9H5a2 2 0 0 0-2 2z"/><path d="M15 8a4 4 0 0 1 0 8"/><path d="M18 5a8 8 0 0 1 0 14"/>' },
  { key:'Capital',   icon:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
  { key:'Withdrawal', icon:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8.5 12.5L12 16l3.5-3.5"/>' },
  { key:'Other',     icon:'<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>' }
];
function categoryMeta(key){ return EXPENSE_CATEGORIES.find(c=>c.key===key) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length-1]; }
function categoryIconSvg(key){
  const meta = categoryMeta(key);
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg>`;
}

let expensesMonth = new Date().toISOString().slice(0,7); // "YYYY-MM"

// A settled loan's actual collection date is derived from its due date
// (disbursed + 30 days) plus daysLate — the same offset already used
// everywhere else in the app for "paid early/late" labels.
function loanDueDate(loan){
  if(loan.repaymentDate) return new Date(loan.repaymentDate+'T00:00:00');
  const due = new Date(loan.date+'T00:00:00');
  due.setDate(due.getDate()+30);
  return due;
}
function loanPaidDate(loan){
  if(loan.status !== 'settled') return null;
  const due = loanDueDate(loan);
  const dl = typeof loan.daysLate === 'number' ? loan.daysLate : 0;
  due.setDate(due.getDate()+dl);
  return localDateKey(due);   // local date — toISOString() shifted it a day early in UTC+2
}

// ---- Expenses page follows the dashboard's period selector ----
function periodDateTest(){
  const r = resolveDateRange();
  const a = localDateKey(r.start), b = localDateKey(r.end);
  return d => { d = (d||'').slice(0,10); return !!d && d >= a && d <= b; };
}
// Collected = repayments on loans that belong to the selected period (the
// same issue-date basis the dashboard and Loans page use), so a month's
// page shows that month's loans and what has been paid back on them.
function periodCollected(){
  return periodLoans().reduce((sum,l)=> l.status==='settled' ? sum + (Number(l.totalDue)||0) : sum, 0);
}
function periodExpenses(){
  const inP = periodDateTest();
  return expenses.filter(e=> inP(e.date));
}
function periodTrueExpenses(){ return periodExpenses().filter(e=>e.type!=='capital' && e.type!=='withdrawal'); }

function monthCollected(month){
  return loans.reduce((sum,l)=>{
    const paid = loanPaidDate(l);
    return (paid && paid.slice(0,7)===month) ? sum + l.totalDue : sum;
  },0);
}
function monthExpenses(month){
  return expenses.filter(e=> (e.date||'').slice(0,7)===month);
}
// "Capital" entries are money added to the lending pool (e.g. an owner
// injection) rather than money spent — they're logged in the same
// expenses table (tagged type:'capital') but kept out of the expense
// totals/breakdowns and instead added back into the funds available to lend.
function monthTrueExpenses(month){
  return monthExpenses(month).filter(e=>e.type!=='capital' && e.type!=='withdrawal');
}
function monthCapital(month){
  return monthExpenses(month).filter(e=>e.type==='capital');
}
// ---------- All-time cash balance (the actual lending pool) ----------
// The Expenses page intentionally shows month-by-month figures (that's
// what monthCollected/monthTrueExpenses/monthCapital above are for), but
// "how much can I actually lend right now" is a running cash balance,
// not something that should reset every time the calendar rolls over.
// Capital injected in June, or a loan repaid in July, is still real
// money sitting in the pool in August — so this sums across every month
// on record: all capital ever added, plus every repayment ever
// collected, minus every true expense ever logged, minus the principal
// of every loan ever disbursed (excludeLoanId skips a loan being edited
// so it doesn't double-count against its own old principal).
function allTimeCollected(){
  return loans.reduce((sum,l)=> loanPaidDate(l) ? sum + l.totalDue : sum, 0);
}
function allTimeTrueExpenses(){
  return expenses.filter(e=>e.type!=='capital' && e.type!=='withdrawal').reduce((s,e)=>s+e.amount,0);
}
function allTimeCapital(){
  return expenses.filter(e=>e.type==='capital').reduce((s,e)=>s+e.amount,0);
}
function allTimeDisbursed(excludeLoanId){
  return loans.reduce((sum,l)=> l.id===excludeLoanId ? sum : sum + l.principal, 0);
}

let expensesScope = 'month'; // 'week' | 'month' | 'year'

function monthLabel(month){
  const [y,m] = month.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString(undefined, {month:'long', year:'numeric'});
}

// Builds a {labels, values} series of net (collected − expenses) for the
// chosen scope, ending at expensesMonth:
//  week  -> last 7 days
//  month -> every day of expensesMonth
//  year  -> last 12 months ending at expensesMonth
function buildSeries(scope){
  const [y,m] = expensesMonth.split('-').map(Number);
  const dayNet = (dateStr) => {
    const collected = loans.reduce((s,l)=> loanPaidDate(l)===dateStr ? s+l.totalDue : s, 0);
    const spent = expenses.reduce((s,e)=> (e.date===dateStr && e.type!=='capital' && e.type!=='withdrawal') ? s+e.amount : s, 0);
    return collected - spent;
  };
  if(scope==='week'){
    const end = new Date(y, m-1, Math.min(new Date(y,m,0).getDate(), new Date().getDate()));
    const labels=[], values=[];
    for(let i=6;i>=0;i--){
      const d = new Date(end); d.setDate(d.getDate()-i);
      const ds = localDateKey(d);
      labels.push(d.toLocaleDateString(undefined,{weekday:'short'}));
      values.push(dayNet(ds));
    }
    return {labels, values};
  }
  if(scope==='year'){
    const labels=[], values=[];
    for(let i=11;i>=0;i--){
      const d = new Date(y, m-1-i, 1);
      const mm = monthKey(d);
      labels.push(d.toLocaleDateString(undefined,{month:'short'}));
      values.push(monthCollected(mm) - monthTrueExpenses(mm).reduce((s,e)=>s+e.amount,0));
    }
    return {labels, values};
  }
  // month
  const days = new Date(y, m, 0).getDate();
  const labels=[], values=[];
  for(let d=1; d<=days; d++){
    const ds = `${expensesMonth}-${String(d).padStart(2,'0')}`;
    labels.push(String(d));
    values.push(dayNet(ds));
  }
  return {labels, values};
}

// This chart is purely decorative — it deliberately does NOT plot the
// real values point-for-point (that produced a jagged, spiky line). It
// draws a smooth, gently-upward curve instead, seeded off the scope so
// it still looks a little different per week/month/year without ever
// looking noisy.
function renderLineChart(series){
  const svg = document.getElementById('expLineChart');
  const {values} = series;
  const W=400, H=170, padX=8, padY=16;
  if(!values.length){
    svg.innerHTML = `<line x1="${padX}" y1="${H/2}" x2="${W-padX}" y2="${H/2}" stroke="var(--border)" stroke-width="2" stroke-dasharray="4 5"/>`;
    return;
  }

  // Deterministic pseudo-random wobble so the curve isn't a perfectly
  // straight ramp, but stays smooth — seeded from the scope sum so it
  // shifts subtly when the underlying totals change.
  const seed = Math.abs(Math.round(values.reduce((s,v)=>s+v,0))) || 7;
  let rnd = seed;
  const next = () => { rnd = (rnd*9301 + 49297) % 233280; return rnd/233280; };

  const POINTS = 7;
  const baseline = H - padY - 6;
  const top = padY + 10;
  const pts = [];
  for(let i=0;i<POINTS;i++){
    const t = i/(POINTS-1);
    const x = padX + t*(W - padX*2);
    // overall upward trend, plus a small smooth wobble
    const trendY = baseline - t*(baseline-top)*0.85;
    const wobble = (next()-0.5) * (H*0.08);
    const y = Math.max(top, Math.min(baseline, trendY + wobble));
    pts.push([x,y]);
  }
  // force a confident, clearly-upward final segment
  pts[POINTS-1][1] = top + 4;

  // Catmull-Rom -> cubic Bezier for a genuinely smooth curve through pts
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for(let i=0;i<pts.length-1;i++){
    const p0 = pts[i-1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i+1];
    const p3 = pts[i+2] || p2;
    const c1x = p1[0] + (p2[0]-p0[0])/6;
    const c1y = p1[1] + (p2[1]-p0[1])/6;
    const c2x = p2[0] - (p3[0]-p1[0])/6;
    const c2y = p2[1] - (p3[1]-p1[1])/6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }

  const areaD = `${d} L ${pts[pts.length-1][0]},${H-padY} L ${pts[0][0]},${H-padY} Z`;
  const last = pts[pts.length-1];
  svg.innerHTML = `
    <defs>
      <linearGradient id="expAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--ink)" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="var(--ink)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#expAreaGrad)" stroke="none"/>
    <path d="${d}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="var(--ink)"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="8" fill="var(--ink)" opacity="0.15"/>
  `;
}

function renderTopSpending(){
  const wrap = document.getElementById('topSpendingList');
  const list = periodTrueExpenses();
  const byCat = {};
  list.forEach(e=>{ byCat[e.category] = (byCat[e.category]||0) + e.amount; });
  const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(!top.length){
    wrap.innerHTML = `<div class="customer-empty">No spending logged in this period.</div>`;
    return;
  }
  const latestByCat = {};
  list.forEach(e=>{ if(!latestByCat[e.category] || e.date>latestByCat[e.category]) latestByCat[e.category]=e.date; });
  wrap.innerHTML = top.map(([cat,amt])=>{
    const meta = categoryMeta(cat);
    return `<div class="top-spending-item">
      <div class="expense-icon">${categoryIconSvg(cat)}</div>
      <div class="expense-main">
        <div class="expense-desc">${cat}</div>
        <div class="expense-sub">${latestByCat[cat]}</div>
      </div>
      <div class="expense-amt">-${fmtFull(amt)}</div>
    </div>`;
  }).join('');
}

function renderExpensePie(collected, totalExpenses){
  const svg = document.getElementById('expPieChart');
  const cx=240, cy=130, rOuter=92, rInner=56;
  const grandTotal = collected + totalExpenses;

  if(grandTotal <= 0){
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="none" stroke="var(--border)" stroke-width="${rOuter-rInner}"/>`;
    return;
  }

  const slices = [
    {frac: collected/grandTotal, cls:'primary'},
    {frac: totalExpenses/grandTotal, cls:'fade'}
  ].filter(s=>s.frac>0);

  const gap = slices.length>1 ? 2.2 : 0;
  const fullRing = (co,ci)=>`M${cx-co},${cy} A${co},${co} 0 1 1 ${cx+co},${cy} A${co},${co} 0 1 1 ${cx-co},${cy} Z M${cx-ci},${cy} A${ci},${ci} 0 1 0 ${cx+ci},${cy} A${ci},${ci} 0 1 0 ${cx-ci},${cy} Z`;
  let cursor = 0;
  svg.innerHTML = slices.map(s=>{
    const startAngle = cursor*360 + gap/2;
    const endAngle = (cursor+s.frac)*360 - gap/2;
    cursor += s.frac;
    const isFull = s.frac >= 0.999;
    const d = isFull ? fullRing(rOuter, rInner) : donutSlicePath(cx,cy,rOuter,rInner,startAngle,endAngle);
    return `<path class="donut-slice ${s.cls}" fill-rule="evenodd" d="${d}"/>`;
  }).join('');
}

// Cardholder name printed on the Expenses page card: the signed-in
// account's full name as initials + surname in capitals —
// "Morne Steyn" -> "M STEYN", "Morne Johan Steyn" -> "M J STEYN".
function cardholderName(){
  const full = prefs.cardholderName || prefs.businessName || '';
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return 'CARDHOLDER';
  if(parts.length === 1) return parts[0].toUpperCase();
  const surname = parts[parts.length-1];
  const initials = parts.slice(0,-1).map(p=>p[0]);
  return [...initials, surname].join(' ').toUpperCase();
}
function renderCardName(){
  const el = document.getElementById('ccName');
  if(el) el.textContent = cardholderName();
}

// Expenses/capital entries always file under the current real-world month —
// the user only picks the day. Clamps to the month's last day.
function currentMonthDateFromDay(day){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const d = Math.min(Math.max(1, Number(day) || now.getDate()), lastDay);
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/* ═══════════════ Expenses page (fixed, no-scroll cockpit) ═══════════════ */
const SPEND_CATS = () => EXPENSE_CATEGORIES.filter(c=>c.key!=='Capital' && c.key!=='Withdrawal');
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function isSpend(e){ return e.type!=='capital' && e.type!=='withdrawal'; }
function sumAmt(list){ return list.reduce((s,e)=>s+(Number(e.amount)||0),0); }
function allTimeWithdrawals(){ return sumAmt(expenses.filter(e=>e.type==='withdrawal')); }
// Real running cash balance (unclamped so a shortfall shows as negative).
function cashBalance(){
  return allTimeCollected() - allTimeTrueExpenses() + allTimeCapital() - allTimeWithdrawals() - allTimeDisbursed();
}
function expPrefs(){
  if(!prefs.budgets || typeof prefs.budgets!=='object') prefs.budgets = {};
  if(!Array.isArray(prefs.recurring)) prefs.recurring = [];
  if(typeof prefs.minCash !== 'number') prefs.minCash = Number(prefs.minCash)||0;
  return prefs;
}
let expTab = 'tx', expPageNo = 0, expSearch = '', expCatFilter = 'all', capMode = 'capital';

/* ---- recurring expenses: post this month's copy once its day has arrived ---- */
function postRecurring(){
  expPrefs();
  const now = new Date(), key = monthKey(now);
  let changed = false;
  prefs.recurring.forEach(r=>{
    if(r.lastPosted === key || now.getDate() < Number(r.day)) return;
    r.lastPosted = key;
    expenses.push({ id:genId(), description:r.description, amount:Number(r.amount), category:r.category,
      date:currentMonthDateFromDay(r.day), notes:'recurring' });
    changed = true;
  });
  if(changed){ saveExpenses(expenses); savePrefs(); }
}

/* ---- month helpers ---- */
function shiftMonth(key, delta){
  const [y,m] = key.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthSpend(key){ return sumAmt(monthTrueExpenses(key)); }
function shortMonth(key){ const [y,m]=key.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString(undefined,{month:'short'}); }
function pctDelta(cur, prev){ if(!prev) return null; return Math.round((cur-prev)/prev*100); }
function deltaHtml(cur, prev, goodWhenUp){
  const p = pctDelta(cur, prev);
  if(p===null) return '<span class="dl dl-flat">–</span>';
  const up = p>0, good = goodWhenUp ? up : !up;
  return `<span class="dl ${p===0?'dl-flat':(good?'dl-good':'dl-bad')}">${up?'▲':p<0?'▼':'■'} ${Math.abs(p)}%</span>`;
}

/* ---- 1. overview ---- */
function renderOverview(range, collected, totalExpenses){
  document.getElementById('expPeriodLbl').textContent = range.label;
  document.getElementById('expCollectedValue').textContent = fmtFullRaw(collected);
  document.getElementById('expTotalValue').textContent = fmtFullRaw(totalExpenses);
  document.getElementById('expStatsValue').textContent = fmtFullRaw(collected - totalExpenses);
  renderExpensePie(collected, totalExpenses);
  const cur = monthSpend(expensesMonth), prev = monthSpend(shiftMonth(expensesMonth,-1));
  document.getElementById('expMomQuick').innerHTML = deltaHtml(cur, prev, false);
}

/* ---- 2. cash & capital ---- */
function avgMonthlyDisbursed(){
  const end = monthKey(new Date()); let total = 0;
  for(let i=1;i<=3;i++){ const k = shiftMonth(end,-i); total += loans.filter(l=>(l.date||'').slice(0,7)===k).reduce((s,l)=>s+(Number(l.principal)||0),0); }
  return total/3;
}
function renderCash(){
  expPrefs();
  const cash = cashBalance(), min = prefs.minCash||0;
  const lent = loans.filter(l=>l.status==='active').reduce((s,l)=>s+(Number(l.principal)||0),0);
  const el = id=>document.getElementById(id);
  el('cashAvail').textContent = fmtFullRaw(cash);
  el('cashAvail').classList.toggle('neg', cash<0);
  el('cashLent').textContent = fmtFullRaw(lent);
  el('cashCap').textContent = fmtFullRaw(allTimeCapital());
  el('cashDraw').textContent = fmtFullRaw(allTimeWithdrawals());
  const inp = el('minCashInput');
  if(document.activeElement !== inp) inp.value = min || '';
  const low = min>0 && cash<min;
  const badge = el('cashBadge');
  badge.textContent = low ? 'Low capital' : (min>0 ? 'Healthy' : 'No alert set');
  badge.className = 'xp-badge ' + (low ? 'bad' : (min>0 ? 'good' : 'none'));
  const recent = expenses.filter(e=>e.type==='capital'||e.type==='withdrawal').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2);
  el('cashRecent').innerHTML = recent.length ? '<small>Recent</small>' + recent.map(e=>`<div><span>${esc(e.description)||(e.type==='capital'?'Capital':'Withdrawal')} · ${e.date}</span><b class="${e.type==='capital'?'pos':'neg'}">${e.type==='capital'?'+':'−'}${fmtFullRaw(e.amount)}</b></div>`).join('') : '';
  const avgLend = avgMonthlyDisbursed();
  let need = 0;
  if(low) need = (min - cash) + avgLend; else if(cash < avgLend) need = avgLend - cash;
  el('cashTopup').innerHTML = need>0
    ? `Suggested top-up: <b>${fmtFullRaw(Math.ceil(need/100)*100)}</b> <span>(covers your ${low?'minimum plus ':''}usual monthly lending)</span>`
    : 'No top-up needed right now.';
  // Low-capital email: at most once per day, only if a notify address is set.
  const today = localDateKey(new Date());
  if(low && prefs.notifyEmail && prefs.lastLowCashAlert !== today){
    prefs.lastLowCashAlert = today; savePrefs();
    fetch(API_BASE + '/api/notify', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ to: prefs.notifyEmail, subject:'TrackLend: low lending capital',
        text:`Your available lending cash is ${fmtFullRaw(cash)}, below your alert level of ${fmtFullRaw(min)}.\nSuggested top-up: ${fmtFullRaw(Math.ceil(need/100)*100)}.` }) }).catch(()=>{});
  }
}

/* ---- 3. budgets + top spending ---- */
function renderBudgets(){
  expPrefs();
  const month = expensesMonth;
  const spendBy = {};
  monthTrueExpenses(month).forEach(e=>{ spendBy[e.category] = (spendBy[e.category]||0) + e.amount; });
  const cats = SPEND_CATS().map(c=>c.key).sort((a,b)=>(spendBy[b]||0)-(spendBy[a]||0));
  let totBud = 0, totSpent = 0;
  const rows = cats.map(cat=>{
    const spent = spendBy[cat]||0, lim = Number(prefs.budgets[cat])||0;
    totSpent += spent; totBud += lim;
    const ratio = lim>0 ? spent/lim : 0;
    const cls = !lim ? 'none' : ratio>=1 ? 'over' : ratio>=.8 ? 'warn' : 'ok';
    return `<div class="xb-row">
      <div class="expense-icon">${categoryIconSvg(cat)}</div>
      <div class="xb-mid">
        <div class="xb-line"><span class="xb-name">${cat}</span>
          <span class="xb-nums">${fmtFullRaw(spent)} / <input class="xb-in" data-budget="${cat}" type="number" min="0" placeholder="limit" value="${lim||''}"/></span></div>
        <div class="xb-bar"><i class="${cls}" style="width:${lim?Math.min(100,ratio*100):(spent?100:0)}%"></i></div>
      </div></div>`;
  }).join('');
  document.getElementById('budList').innerHTML = rows;
  document.getElementById('budSummary').textContent = totBud ? `${fmtFullRaw(totSpent)} of ${fmtFullRaw(totBud)}` : monthLabel(month);
}

/* ---- 4. trends & forecast ---- */
function recurringMonthly(){ expPrefs(); return prefs.recurring.reduce((s,r)=>s+(Number(r.amount)||0),0); }
function avgMonthlySpend(){ const end = monthKey(new Date()); let t=0; for(let i=1;i<=3;i++) t += monthSpend(shiftMonth(end,-i)); return t/3; }
function forecast(days){
  const today = new Date(); today.setHours(0,0,0,0);
  const horizon = addDays(today, days);
  const inflow = loans.filter(l=>l.status==='active').reduce((s,l)=>{ const d = loanDueDate(l); return (d>=today && d<=horizon) ? s+(Number(l.totalDue)||0) : s; },0);
  const outflow = Math.max(avgMonthlySpend(), recurringMonthly()) * days/30;
  return { inflow, outflow, balance: cashBalance() + inflow - outflow };
}
// Trends always look at the real calendar (this month + the 5 before it),
// whatever period the dashboard selector is set to. "Collected" uses the same
// basis as the Overview: repayments on loans issued in that month.
function monthCollectedByIssue(m){
  return loans.reduce((s,l)=> (l.status==='settled' && (l.date||'').slice(0,7)===m) ? s+(Number(l.totalDue)||0) : s, 0);
}
function renderTrends(){
  const cur = monthKey(new Date()), prev = shiftMonth(cur,-1);
  document.getElementById('trendLbl').textContent = monthLabel(cur) + ' vs ' + shortMonth(prev);
  const cs = monthCollectedByIssue(cur), ps = monthCollectedByIssue(prev);
  const ce = monthSpend(cur), pe = monthSpend(prev);
  document.getElementById('momRow').innerHTML = `
    <div><small>Collected</small><b>${fmtFullRaw(cs)}</b>${deltaHtml(cs,ps,true)}</div>
    <div><small>Expenses</small><b>${fmtFullRaw(ce)}</b>${deltaHtml(ce,pe,false)}</div>
    <div><small>Net</small><b>${fmtFullRaw(cs-ce)}</b>${deltaHtml(cs-ce,ps-pe,true)}</div>`;
  // 6-month grouped bars
  const months = []; for(let i=5;i>=0;i--) months.push(shiftMonth(cur,-i));
  const data = months.map(m=>({m, c:monthCollectedByIssue(m), e:monthSpend(m)}));
  const max = Math.max(1, ...data.map(d=>Math.max(d.c,d.e)));
  const bw = 14, gw = 300/6;
  document.getElementById('trendChart').innerHTML = data.map((d,i)=>{
    const x = i*gw + (gw-2*bw-2)/2, hc = d.c/max*80, he = d.e/max*80;
    return `<rect x="${x}" y="${84-hc}" width="${bw}" height="${hc}" rx="2" fill="var(--indigo)"/>
            <rect x="${x+bw+2}" y="${84-he}" width="${bw}" height="${he}" rx="2" fill="var(--black)"/>
            `;
  }).join('');
  document.getElementById('trendLabels').innerHTML = data.map(d=>`<span>${shortMonth(d.m)}</span>`).join('');
  const min = prefs.minCash||0;
  document.getElementById('fcRows').innerHTML = [30,60].map(d=>{
    const f = forecast(d), bad = f.balance < Math.max(0, min);
    return `<div class="fc-row${bad?' bad':''}"><span>Next ${d} days</span>
      <span class="fc-parts">+${fmtFullRaw(f.inflow)} due · −${fmtFullRaw(f.outflow)} costs</span>
      <b>${fmtFullRaw(f.balance)}${bad?' ⚠':''}</b></div>`;
  }).join('');
}

/* ---- 5. transactions / capital log / recurring ---- */
function filteredTx(){
  const q = expSearch.trim().toLowerCase();
  return periodExpenses().filter(e=>{
    if(expCatFilter==='all') {} else if(expCatFilter==='Capital'){ if(e.type!=='capital') return false; }
    else if(expCatFilter==='Withdrawal'){ if(e.type!=='withdrawal') return false; }
    else if(e.category!==expCatFilter || !isSpend(e)) return false;
    if(q && !((e.description||'')+' '+e.category+' '+(e.notes||'')).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>b.date.localeCompare(a.date));
}
function txRow(e){
  const cap = e.type==='capital', wd = e.type==='withdrawal';
  const label = cap ? 'Capital' : wd ? 'Withdrawal' : e.category;
  const src = (cap && e.notes) ? ' · '+esc(e.notes) : '';
  const rec = e.notes==='recurring' ? ' · 🔁' : '';
  return `<div class="expense-item xrow${cap?' expense-item-capital':''}">
    <div class="expense-icon">${categoryIconSvg(cap?'Capital':wd?'Withdrawal':e.category)}</div>
    <div class="expense-main"><div class="expense-desc">${esc(e.description)||label}</div>
      <div class="expense-sub">${label} · ${e.date}${src}${rec}</div></div>
    ${e.receipt?`<button class="xicon" data-receipt="${e.id}" title="View receipt">📎</button>`:''}
    <div class="expense-amt${cap?' expense-amt-credit':''}">${cap?'+':'-'}${fmtFullRaw(e.amount)}</div>
    <button class="expense-del" data-del-expense="${e.id}" title="Delete">✕</button></div>`;
}
function pagerHtml(total, per){
  const pages = Math.max(1, Math.ceil(total/per));
  expPageNo = Math.min(expPageNo, pages-1);
  if(total<=per) return `<span>${total} item${total===1?'':'s'}</span>`;
  return `<button class="xbtn" data-xpage="-1" ${expPageNo===0?'disabled':''}>‹</button>
    <span>${expPageNo+1} / ${pages} · ${total} items</span>
    <button class="xbtn" data-xpage="1" ${expPageNo>=pages-1?'disabled':''}>›</button>`;
}
function rowsFit(reserve){
  const h = document.getElementById('xBody').clientHeight;
  return h > 0 ? Math.max(2, Math.floor((h - (reserve||0)) / 42)) : 5;
}
let TX_PER = 5, CAP_PER = 4, REC_PER = 3;
window.addEventListener('resize', ()=>{ if(currentPage==='expenses') renderTxPanel(); });
let _lastFit = 0;
function renderTxPanel(){
  expPrefs();
  TX_PER = rowsFit(0); CAP_PER = rowsFit(34); REC_PER = rowsFit(44);
  if(TX_PER !== _lastFit){ _lastFit = TX_PER; requestAnimationFrame(renderTxPanel); }
  document.querySelectorAll('#xTabs button').forEach(b=>b.classList.toggle('active', b.dataset.xtab===expTab));
  document.getElementById('xToolsTx').classList.toggle('minimal', expTab!=='tx');
  const body = document.getElementById('xBody'), pager = document.getElementById('xPager');
  if(expTab==='tx'){
    const sel = document.getElementById('xCat');
    sel.value = expCatFilter;
    if(typeof refreshCustomSelect === 'function') refreshCustomSelect('xCat');
    const list = filteredTx(); pager.innerHTML = pagerHtml(list.length, TX_PER);
    const slice = list.slice(expPageNo*TX_PER, expPageNo*TX_PER+TX_PER);
    body.innerHTML = slice.length ? slice.map(txRow).join('') : '<div class="customer-empty">Nothing matches in this period.</div>';
  } else if(expTab==='cap'){
    const entries = expenses.filter(e=>e.type==='capital'||e.type==='withdrawal').sort((a,b)=>b.date.localeCompare(a.date));
    const bySrc = {}; entries.forEach(e=>{ const k = e.type==='capital' ? (e.notes||'Owner') : 'Withdrawn'; bySrc[k]=(bySrc[k]||0)+e.amount; });
    const equity = allTimeCapital() - allTimeWithdrawals();
    const chips = Object.entries(bySrc).map(([k,v])=>`<span class="xchip${k==='Withdrawn'?' wd':''}">${esc(k)} ${k==='Withdrawn'?'−':''}${fmtFullRaw(v)}</span>`).join('');
    pager.innerHTML = pagerHtml(entries.length, CAP_PER);
    const slice = entries.slice(expPageNo*CAP_PER, expPageNo*CAP_PER+CAP_PER);
    body.innerHTML = `<div class="xeq"><span>Net capital in business: <b>${fmtFullRaw(equity)}</b></span><span class="xchips">${chips||'No capital logged yet.'}</span></div>` +
      slice.map(txRow).join('');
  } else {
    const rec = prefs.recurring;
    pager.innerHTML = `<span>Committed each month: <b>${fmtFullRaw(recurringMonthly())}</b></span>` + (rec.length>REC_PER ? pagerHtml(rec.length, REC_PER) : '');
    body.innerHTML = `<div class="xrec-form">
        <input id="rec_desc" placeholder="Description"/>
        <select id="rec_cat">${SPEND_CATS().map(c=>`<option>${c.key}</option>`).join('')}</select>
        <input id="rec_amt" type="number" min="1" placeholder="Amount"/>
        <input id="rec_day" type="number" min="1" max="31" placeholder="Day"/>
        <button class="xbtn xbtn-primary" id="rec_add">Add</button></div>` +
      (rec.length ? rec.slice(expPageNo*REC_PER, expPageNo*REC_PER+REC_PER).map(r=>`<div class="expense-item xrow"><div class="expense-icon">${categoryIconSvg(r.category)}</div>
        <div class="expense-main"><div class="expense-desc">${esc(r.description)||r.category}</div><div class="expense-sub">${r.category} · every month on day ${r.day}</div></div>
        <div class="expense-amt">-${fmtFullRaw(r.amount)}</div><button class="expense-del" data-del-rec="${r.id}" title="Stop repeating">✕</button></div>`).join('')
        : '<div class="customer-empty">No recurring expenses yet.</div>');
    // keep the list compact: only the first 3 recurring rows fit alongside the form
  }
}

function renderExpenses(){
  postRecurring();
  const range = resolveDateRange();
  expensesMonth = monthKey(range.end);
  const collected = periodCollected();
  const totalExpenses = periodTrueExpenses().reduce((s,e)=>s+e.amount,0);
  renderOverview(range, collected, totalExpenses);
  renderCash();
  renderBudgets();
  renderTrends();
  renderTxPanel();
}

/* ---- receipts: shrink the photo before it is stored ---- */
function readReceipt(file){
  return new Promise(resolve=>{
    if(!file) return resolve('');
    const fr = new FileReader();
    fr.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        const s = Math.min(1, 900/Math.max(img.width,img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL('image/jpeg',0.6));
      };
      img.onerror = ()=>resolve('');
      img.src = fr.result;
    };
    fr.onerror = ()=>resolve('');
    fr.readAsDataURL(file);
  });
}

/* ---- export ---- */
function downloadCsv(){
  const rows = [['Date','Type','Category','Description','Amount','Notes']].concat(filteredTx().map(e=>[e.date, e.type||'expense', e.category, e.description||'', e.amount, e.notes||'']));
  const csv = rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = 'tracklend-expenses-'+expensesMonth+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
}
function printStatement(){
  const list = filteredTx(), range = resolveDateRange();
  const body = list.map(e=>`<tr><td>${e.date}</td><td>${e.type||'expense'}</td><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td style="text-align:right">${e.type==='capital'?'+':'-'}${fmtFullRaw(e.amount)}</td></tr>`).join('');
  const html = `<html><head><title>Statement</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}h2{margin:0 0 4px}</style></head><body>
    <h2>${esc(prefs.businessName||'TrackLend')} – Expense statement</h2><p>${esc(range.label)}</p>
    <table><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th style="text-align:right">Amount</th></tr>${body}</table></body></html>`;
  const f = document.createElement('iframe'); f.style.cssText='position:fixed;width:0;height:0;border:0';
  document.body.appendChild(f); f.srcdoc = html;
  f.onload = ()=>{ f.contentWindow.focus(); f.contentWindow.print(); setTimeout(()=>f.remove(), 2000); };
}

/* ---- events ---- */
document.getElementById('xTabs').addEventListener('click', e=>{
  const b = e.target.closest('button[data-xtab]'); if(!b) return;
  expTab = b.dataset.xtab; expPageNo = 0; renderTxPanel();
});
document.getElementById('expensesPage').addEventListener('click', e=>{
  const pg = e.target.closest('button[data-xpage]');
  if(pg){ expPageNo = Math.max(0, expPageNo + Number(pg.dataset.xpage)); renderTxPanel(); return; }
  const rc = e.target.closest('button[data-receipt]');
  if(rc){ const ex = expenses.find(x=>x.id===rc.dataset.receipt); if(ex && ex.receipt){ document.getElementById('receiptImg').src = ex.receipt; document.getElementById('receiptOverlay').classList.add('open'); } return; }
  const dr = e.target.closest('button[data-del-rec]');
  if(dr){ if(!confirm('Stop repeating this expense? Past entries stay.')) return; prefs.recurring = prefs.recurring.filter(r=>r.id!==dr.dataset.delRec); savePrefs(); renderTxPanel(); return; }
  if(e.target.id==='rec_add'){
    const description = document.getElementById('rec_desc').value.trim();
    const amount = Number(document.getElementById('rec_amt').value), day = Number(document.getElementById('rec_day').value);
    if(!amount || amount<=0 || !day || day<1 || day>31) return;
    expPrefs().recurring.push({ id:genId(), description, category:document.getElementById('rec_cat').value, amount, day, lastPosted:'' });
    savePrefs(); renderExpenses(); return;
  }
  if(e.target.id==='xCsv') downloadCsv();
  if(e.target.id==='xPdf') printStatement();
  if(e.target.id==='cashAddCapBtn') openCapitalForm('capital');
  if(e.target.id==='cashWithdrawBtn') openCapitalForm('withdrawal');
});
document.getElementById('receiptOverlay').addEventListener('click', ()=>document.getElementById('receiptOverlay').classList.remove('open'));
document.getElementById('xSearch').addEventListener('input', e=>{ expSearch = e.target.value; expPageNo = 0; renderTxPanel(); });
document.getElementById('xCat').addEventListener('change', e=>{ expCatFilter = e.target.value; expPageNo = 0; renderTxPanel(); });
document.getElementById('minCashInput').addEventListener('change', e=>{ expPrefs().minCash = Math.max(0, Number(e.target.value)||0); prefs.lastLowCashAlert=''; savePrefs(); renderCash(); renderTrends(); });
document.getElementById('budList').addEventListener('change', e=>{
  const inp = e.target.closest('input[data-budget]'); if(!inp) return;
  const v = Math.max(0, Number(inp.value)||0);
  if(v) expPrefs().budgets[inp.dataset.budget] = v; else delete expPrefs().budgets[inp.dataset.budget];
  savePrefs(); renderBudgets();
});

// Add flows
document.getElementById('addExpenseBtn').addEventListener('click', ()=>{
  document.getElementById('expenseChoiceOverlay').classList.add('open');
});
document.getElementById('choiceCancelBtn').addEventListener('click', ()=>{
  document.getElementById('expenseChoiceOverlay').classList.remove('open');
});
document.getElementById('chooseTrackExpense').addEventListener('click', ()=>{
  document.getElementById('expenseChoiceOverlay').classList.remove('open');
  document.getElementById('expenseForm').reset();
  document.getElementById('exp_date').value = new Date().getDate();
  document.getElementById('expenseModalOverlay').classList.add('open');
  setTimeout(()=> document.getElementById('exp_description').focus(), 0);
});
function openCapitalForm(mode){
  capMode = mode;
  document.getElementById('expenseChoiceOverlay').classList.remove('open');
  document.getElementById('capitalForm').reset();
  document.getElementById('cap_date').value = new Date().getDate();
  const wd = mode==='withdrawal';
  document.getElementById('capTitle').textContent = wd ? 'Owner withdrawal' : 'Add capital';
  document.getElementById('capSubmit').textContent = wd ? 'Withdraw' : 'Add capital';
  document.getElementById('cap_sourceLbl').style.display = document.getElementById('cap_source').style.display = wd ? 'none' : '';
  document.getElementById('capitalModalOverlay').classList.add('open');
  setTimeout(()=> document.getElementById('cap_description').focus(), 0);
}
document.getElementById('chooseAddCapital').addEventListener('click', ()=>openCapitalForm('capital'));
document.getElementById('chooseWithdraw').addEventListener('click', ()=>openCapitalForm('withdrawal'));
document.getElementById('expenseCancelBtn').addEventListener('click', ()=>{
  document.getElementById('expenseModalOverlay').classList.remove('open');
});
document.getElementById('expenseForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const amount = Number(document.getElementById('exp_amount').value);
  if(!amount || amount<=0) return;
  const receipt = await readReceipt(document.getElementById('exp_receipt').files[0]);
  const description = document.getElementById('exp_description').value.trim();
  const category = document.getElementById('exp_category').value;
  const day = document.getElementById('exp_date').value;
  const recurring = document.getElementById('exp_recurring').checked;
  expenses.push({ id: genId(), description, amount, category, date: currentMonthDateFromDay(day), receipt, notes: recurring ? 'recurring' : '' });
  if(recurring){
    expPrefs().recurring.push({ id:genId(), description, category, amount, day:Number(day)||new Date().getDate(), lastPosted: monthKey(new Date()) });
    savePrefs();
  }
  saveExpenses(expenses);
  expensesMonth = new Date().toISOString().slice(0,7);
  document.getElementById('expenseModalOverlay').classList.remove('open');
  renderExpenses();
});
document.getElementById('capitalCancelBtn').addEventListener('click', ()=>{
  document.getElementById('capitalModalOverlay').classList.remove('open');
});
document.getElementById('capitalForm').addEventListener('submit', e=>{
  e.preventDefault();
  const amount = Number(document.getElementById('cap_amount').value);
  if(!amount || amount<=0) return;
  const wd = capMode==='withdrawal';
  expenses.push({
    id: genId(),
    description: document.getElementById('cap_description').value.trim(),
    amount,
    category: wd ? 'Withdrawal' : 'Capital',
    type: wd ? 'withdrawal' : 'capital',
    notes: wd ? '' : document.getElementById('cap_source').value,
    date: currentMonthDateFromDay(document.getElementById('cap_date').value)
  });
  saveExpenses(expenses);
  expensesMonth = new Date().toISOString().slice(0,7);
  document.getElementById('capitalModalOverlay').classList.remove('open');
  renderExpenses();
});

document.addEventListener('click', e=>{
  const btn = e.target.closest('button[data-del-expense]');
  if(!btn) return;
  if(!confirm('Delete this expense?')) return;
  expenses = expenses.filter(x=>x.id!==btn.dataset.delExpense);
  saveExpenses(expenses);
  renderExpenses();
});

document.addEventListener('click', e=>{
  const btn = e.target.closest('button[data-paid]');
  if(!btn) return;
  const loan = loans.find(l=>l.id===btn.dataset.paid);
  if(!loan || loan.status!=='active') return;
  loan.status = 'settled';
  loan.daysLate = autoDaysLate(loan);
  cd_selectedLoanIds.delete(loan.id);
  saveLoans(loans);
  render();
  renderCustomers();
  // Stay right where the user was (same tab, same ticked checkboxes)
  // instead of snapping back to the Overview tab.
  if(cd_currentCustomer) openCustomerDetail(cd_currentCustomer, { preserveTab: true });
});

// Undo — puts a settled loan back to active with no late/on-time record,
// in case "mark as paid" was clicked by mistake.
document.addEventListener('click', e=>{
  const btn = e.target.closest('button[data-unpaid]');
  if(!btn) return;
  const loan = loans.find(l=>l.id===btn.dataset.unpaid);
  if(!loan || loan.status!=='settled') return;
  if(!confirm(`Undo "paid" for ${loan.customer}'s ${fmtFullRaw(loan.totalDue)} loan? It will move back to Active loans.`)) return;
  loan.status = 'active';
  delete loan.daysLate;
  saveLoans(loans);
  render();
  renderCustomers();
  if(cd_currentCustomer) openCustomerDetail(cd_currentCustomer, { preserveTab: true });
});

// Checkbox selection for bulk "mark as paid" — just tracks ids, no re-render
// needed (avoids losing focus/scroll position while ticking boxes).
document.addEventListener('change', e=>{
  const cb = e.target.closest('input[data-select-loan]');
  if(!cb) return;
  const id = cb.dataset.selectLoan;
  if(cb.checked) cd_selectedLoanIds.add(id); else cd_selectedLoanIds.delete(id);
  updateBulkPaidBtn();
});

function updateBulkPaidBtn(){
  const btn = document.getElementById('cd_bulkPaidBtn');
  if(!btn) return;
  const n = cd_selectedLoanIds.size;
  btn.style.display = n ? '' : 'none';
  btn.textContent = n>1 ? `Mark ${n} loans as paid` : 'Mark selected as paid';
}

document.getElementById('cd_bulkPaidBtn')?.addEventListener('click', ()=>{
  const ids = [...cd_selectedLoanIds];
  if(!ids.length) return;
  const targets = loans.filter(l=>ids.includes(l.id) && l.status==='active');
  if(!targets.length) return;
  if(!confirm(`Mark ${targets.length} loan${targets.length>1?'s':''} as paid?`)) return;
  targets.forEach(loan=>{
    loan.status = 'settled';
    loan.daysLate = autoDaysLate(loan);
  });
  cd_selectedLoanIds.clear();
  saveLoans(loans);
  render();
  renderCustomers();
  if(cd_currentCustomer) openCustomerDetail(cd_currentCustomer, { preserveTab: true });
});
function setSettingsStatus(msg, isError){
  const el = document.getElementById('settingsStatus');
  if(!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!isError);
}
document.getElementById('navDashboard').addEventListener('click', e=>{
  e.preventDefault(); setActiveNav('navDashboard');
  document.querySelector('.main').scrollTo({top:0, behavior:'smooth'});
});
document.getElementById('navCustomers').addEventListener('click', e=>{
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navCustomers'));
  showPage('customers');
});
document.getElementById('navLoans').addEventListener('click', e=>{
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navLoans'));
  showPage('loans');
});
document.getElementById('navExpenses').addEventListener('click', e=>{
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navExpenses'));
  showPage('expenses');
});
document.getElementById('navFinance').addEventListener('click', e=>{
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navFinance'));
  showPage('finance');
});
document.getElementById('navRisk').addEventListener('click', e=>{
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.id==='navRisk'));
  showPage('risk');
});
document.getElementById('navSettings').addEventListener('click', e=>{
  e.preventDefault(); showSettings(true);
});
['viewAllLoans','viewAllActivity'].forEach(id=>{
  document.getElementById(id)?.addEventListener('click', ()=>{ prefs.view='table'; savePrefs(); render(); });
});


const modal = document.getElementById('modalOverlay');
const WIZARD_TOTAL_STEPS = 4;
let wizardStep = 1;
let wizardDir = 'fwd';

// Loans can only be created for customers with a complete profile —
// the select is populated from that list only, never from free text.
function populateCustomerSelect(){
  const sel = document.getElementById('f_name');
  const empty = document.getElementById('f_noCustomers');
  if(!sel) return;
  const names = completeCustomerNames();
  if(!names.length){
    sel.innerHTML = '';
    sel.disabled = true;
    if(empty) empty.style.display = '';
  } else {
    sel.disabled = false;
    if(empty) empty.style.display = 'none';
    sel.innerHTML = '<option value="" disabled selected>Select a customer…</option>' +
      names.map(n=>`<option value="${n}">${n}</option>`).join('');
  }
}

// "Left after expenses" pool the pie chart measures the loan against —
// an all-time running cash balance: every rand of capital ever injected
// and every repayment ever collected, minus every true expense and every
// rand of principal ever disbursed (excludeLoanId skips a loan currently
// being edited). This is a real balance, not a monthly snapshot — it
// doesn't forget capital or repayments just because the month changed,
// and it doesn't "refill" once a loan is disbursed.
function availableAfterExpenses(excludeLoanId){
  const collected = allTimeCollected();
  const totalExpenses = allTimeTrueExpenses();
  const totalCapital = allTimeCapital();
  const disbursed = allTimeDisbursed(excludeLoanId);
  return Math.max(0, collected - totalExpenses + totalCapital - allTimeWithdrawals() - disbursed);
}

const AMOUNT_PIE_CIRC = 2 * Math.PI * 50; // r=50 from the SVG circle

function renderAmountPie(amount){
  const available = availableAfterExpenses();
  const fill = document.getElementById('f_amountPieFill');
  const note = document.getElementById('f_pieNote');
  document.getElementById('f_pieBorrowed').textContent = fmtFullRaw(amount);

  if(available <= 0){
    fill.style.strokeDasharray = `0 ${AMOUNT_PIE_CIRC}`;
    document.getElementById('f_pieRemaining').textContent = 'R0';
    note.textContent = 'No funds logged as collected after expenses yet this month.';
    return;
  }

  const frac = Math.min(1, amount / available);
  const dash = frac * AMOUNT_PIE_CIRC;
  fill.style.strokeDasharray = `${dash} ${AMOUNT_PIE_CIRC}`;
  fill.classList.toggle('over-budget', amount > available);
  document.getElementById('f_pieRemaining').textContent = fmtFullRaw(Math.max(0, available - amount));
  note.textContent = amount > available
    ? `This exceeds the ${fmtFullRaw(available)} left after expenses this month.`
    : '';
}

function syncAmountFromSlider(){
  const v = Number(document.getElementById('f_amountSlider').value);
  document.getElementById('f_amount').value = v;
  document.getElementById('f_amountCustom').value = v;
  document.getElementById('f_amountBig').textContent = v.toLocaleString('en-ZA');
  updatePreview('f_amount','f_preview');
  renderAmountPie(v);
}
function syncSliderFromAmount(v){
  v = Number(v) || 0;
  document.getElementById('f_amount').value = v;
  const slider = document.getElementById('f_amountSlider');
  slider.value = Math.min(Math.max(v, slider.min), slider.max);
  document.getElementById('f_amountBig').textContent = v.toLocaleString('en-ZA');
  updatePreview('f_amount','f_preview');
  renderAmountPie(v);
}

function renderWizardSummary(){
  const name = document.getElementById('f_name').value.trim() || '—';
  const amount = Number(document.getElementById('f_amount').value) || 0;
  const { interest, totalDue } = calcCycle(amount);
  const date = document.getElementById('f_date').value || '—';
  const repaymentDate = document.getElementById('f_repaymentDate').value || '—';
  document.getElementById('f_summary').innerHTML = `
    <div class="review-row"><span class="review-label">Customer</span><span class="review-value">${name}</span></div>
    <div class="review-row"><span class="review-label">Principal</span><span class="review-value">${fmtFullRaw(amount)}</span></div>
    <div class="review-row"><span class="review-label">Interest (${Math.round(INTEREST_RATE*100)}%)</span><span class="review-value">${fmtFullRaw(interest)}</span></div>
    <div class="review-row"><span class="review-label">Total due</span><span class="review-value">${fmtFullRaw(totalDue)}</span></div>
    <div class="review-row"><span class="review-label">Date issued</span><span class="review-value">${date}</span></div>
    <div class="review-row"><span class="review-label">Repayment date</span><span class="review-value">${repaymentDate}</span></div>
  `;
  if(!document.getElementById('f_password').value){
    document.getElementById('f_password').value = genRemovalPassword();
  }
}

function genRemovalPassword(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for(let i=0;i<10;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function wizardValidateStep(step){
  if(step===1){
    const sel = document.getElementById('f_name');
    if(sel.disabled || !sel.value){ sel.focus(); return false; }
    if(!isCustomerComplete(getCustomerProfile(sel.value))){
      alert('This customer\'s profile is incomplete — open their folder on the Customers page and finish their details before lending to them.');
      return false;
    }
  } else if(step===2){
    if(!Number(document.getElementById('f_amount').value)){ document.getElementById('f_amountSlider').focus(); return false; }
  } else if(step===3){
    if(!document.getElementById('f_date').value){ document.getElementById('f_date').focus(); return false; }
    if(!document.getElementById('f_repaymentDate').value){ document.getElementById('f_repaymentDate').focus(); return false; }
  } else if(step===4){
    if(!document.getElementById('f_password').value){ return false; }
  }
  return true;
}

function goToWizardStep(step, dir){
  wizardStep = step; wizardDir = dir;
  document.querySelectorAll('.step-panel').forEach(p=>{
    const isActive = Number(p.dataset.step) === step;
    p.classList.toggle('active', isActive);
    p.classList.toggle('back-nav', dir==='back');
  });
  document.getElementById('wizardProgressFill').style.width = (step/WIZARD_TOTAL_STEPS*100)+'%';
  document.getElementById('wizardStepLabel').textContent = `Step ${step}/${WIZARD_TOTAL_STEPS}`;
  document.getElementById('wizardTitle').textContent =
    step===1 ? 'Customer' : step===2 ? 'Loan Amount' : step===3 ? 'Loan Details' : 'Review & Confirm';
  document.getElementById('wizardBackBtn').classList.toggle('hidden', step===1);
  document.getElementById('wizardSecondaryBtn').textContent = step===1 ? 'Cancel' : 'Back';
  document.getElementById('wizardNextBtn').textContent = step===WIZARD_TOTAL_STEPS ? 'Add loan' : 'Continue';
  if(step===2) renderAmountPie(Number(document.getElementById('f_amount').value) || 0);
  if(step===4) renderWizardSummary();
}

/* The hero's "New Loan" button was removed (replaced by the date-range
   picker) — the top nav's #openModalBtnTop is now the only entry point,
   so the wizard-opening logic lives in this named function. */
function openLoanWizard(){
  document.getElementById('f_date').value = todayStr();
  document.getElementById('f_password').value='';
  document.getElementById('f_amount').value='';
  document.getElementById('f_amountCustom').value='';
  document.getElementById('f_amountSlider').value = 1000;
  document.getElementById('f_amountBig').textContent = '0';
  document.getElementById('f_risk').innerHTML = riskPanelHTML('');
  const defaultRepay = new Date(todayStr()+'T00:00:00');
  defaultRepay.setDate(defaultRepay.getDate()+30);
  document.getElementById('f_repaymentDate').value = defaultRepay.toISOString().slice(0,10);
  updatePreview('f_amount','f_preview');
  populateCustomerSelect();
  goToWizardStep(1, 'fwd');
  modal.classList.add('open');
}
document.getElementById('openModalBtn')?.addEventListener('click', openLoanWizard);
document.getElementById('f_goCreateCustomer')?.addEventListener('click', ()=>{
  closeWizardModal();
  openNewCustomerModal();
});
document.getElementById('f_amountSlider').addEventListener('input', syncAmountFromSlider);
document.getElementById('f_amountCustom').addEventListener('input', e=> syncSliderFromAmount(e.target.value));
document.getElementById('f_date').addEventListener('change', ()=>{
  // Keep the repayment date from landing before the issue date; otherwise
  // leave whatever the user has already chosen alone.
  const issued = document.getElementById('f_date').value;
  const repay = document.getElementById('f_repaymentDate');
  if(issued && repay.value && repay.value < issued) repay.value = issued;
  if(issued) repay.min = issued;
});
// f_name is now a <select> of already-complete customers, so the risk
// profile can render immediately on change — no debounce needed.
document.getElementById('f_name').addEventListener('change', ()=>{
  const name = document.getElementById('f_name').value;
  renderRiskPanel(name, 'f_risk', 'f_name');
});
document.getElementById('d_amount').addEventListener('input', ()=> updatePreview('d_amount','d_preview'));
let d_riskDebounce = null;
document.getElementById('d_name').addEventListener('input', ()=>{
  clearTimeout(d_riskDebounce);
  const name = document.getElementById('d_name').value;
  d_riskDebounce = setTimeout(()=> renderRiskPanel(name, 'd_risk', 'd_name'), 350);
});
document.getElementById('d_status').addEventListener('change', toggleDaysLateField);

function closeWizardModal(){ modal.classList.remove('open'); }
document.getElementById('wizardCloseBtn').addEventListener('click', closeWizardModal);
modal.addEventListener('click', e=>{ if(e.target===modal) closeWizardModal(); });

document.getElementById('wizardSecondaryBtn').addEventListener('click', ()=>{
  if(wizardStep===1){ closeWizardModal(); return; }
  goToWizardStep(wizardStep-1, 'back');
});
document.getElementById('wizardBackBtn').addEventListener('click', ()=>{
  if(wizardStep===1) return;
  goToWizardStep(wizardStep-1, 'back');
});
document.getElementById('wizardNextBtn').addEventListener('click', ()=>{
  if(!wizardValidateStep(wizardStep)) return;
  if(wizardStep < WIZARD_TOTAL_STEPS){ goToWizardStep(wizardStep+1, 'fwd'); return; }
  document.getElementById('loanForm').requestSubmit();
});

document.getElementById('loanForm').addEventListener('submit', e=>{
  e.preventDefault();
  const customer = document.getElementById('f_name').value.trim();
  const principal = Number(document.getElementById('f_amount').value);
  const date = document.getElementById('f_date').value;
  const repaymentDate = document.getElementById('f_repaymentDate').value;
  const password = document.getElementById('f_password').value || genRemovalPassword();
  if(!customer || !principal || !date || !repaymentDate){
    const missing = [];
    if(!customer) missing.push('customer name');
    if(!principal) missing.push('loan amount');
    if(!date) missing.push('date issued');
    if(!repaymentDate) missing.push('repayment date');
    alert('Could not add loan — missing: ' + missing.join(', ') + '. Please go back and fill these in.');
    return;
  }
  const {interest, totalDue} = calcCycle(principal);
  const newLoan = {
    id:genId(), customer, principal,
    interest, totalDue, cycleType:'new', rolloverCount:0, status:'active',
    date, repaymentDate, notes:'', parentId:null, password
  };
  loans.push(newLoan);
  saveLoans(loans).then(ok=>{
    if(ok===false) alert('The loan was added on screen, but saving it to the database failed. Check that the server is running and try again — otherwise this loan will be lost on refresh.');
  });
  notifyLoanByEmail(newLoan);
  e.target.reset(); closeWizardModal(); render();
});

function notifyLoanByEmail(loan){
  if(!prefs.notifyEvents || prefs.notifyEvents.newLoan === false) return;
  const to = prefs.notifyEmail;
  if(!to) return; // no business email configured in Settings — skip silently
  fetch(API_BASE + '/api/notify-loan', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ to, loan })
  }).then(res=>res.json()).then(data=>{
    if(!data.ok) console.error('Loan notification email not sent:', data.error);
  }).catch(err=> console.error('Loan notification email failed:', err));
}

const detailOverlay = document.getElementById('detailOverlay');
document.getElementById('detailCancelBtn').addEventListener('click', ()=> detailOverlay.classList.remove('open'));
detailOverlay.addEventListener('click', e=>{ if(e.target===detailOverlay) detailOverlay.classList.remove('open'); });
document.getElementById('deleteBtn').addEventListener('click', ()=>{
  loans = loans.filter(l=>l.id!==editingId); saveLoans(loans); detailOverlay.classList.remove('open'); render();
});
document.getElementById('detailForm').addEventListener('submit', e=>{
  e.preventDefault();
  const loan = loans.find(l=>l.id===editingId); if(!loan) return;
  loan.customer = document.getElementById('d_name').value.trim();
  loan.principal = Number(document.getElementById('d_amount').value);
  const {interest, totalDue} = calcCycle(loan.principal);
  loan.interest = interest; loan.totalDue = totalDue;
  loan.date = document.getElementById('d_date').value;
  const chosenStatus = document.getElementById('d_status').value;
  loan.status = (chosenStatus==='settled' && loan.status!=='settled') ? loan.status : chosenStatus;
  if(['settled','rolled'].includes(loan.status)){
    const dl = document.getElementById('d_daysLate').value;
    loan.daysLate = dl==='' ? 0 : Number(dl);
  } else {
    delete loan.daysLate;
  }
  loan.notes = document.getElementById('d_notes').value;
  saveLoans(loans); detailOverlay.classList.remove('open'); render();
});


/* ---------- settings: backup, restore, clear ---------- */
function normaliseLoan(o){
  const principal = Number(o.principal)||0;
  const interest = o.interest!==undefined && o.interest!=='' ? Number(o.interest) : Math.round(principal*INTEREST_RATE);
  const totalDue = o.totalDue!==undefined && o.totalDue!=='' ? Number(o.totalDue) : principal+interest;
  const loan = {
    id: o.id || genId(),
    customer: String(o.customer||'Unknown').trim(),
    principal, interest, totalDue,
    cycleType: o.cycleType==='rollover' ? 'rollover' : 'new',
    rolloverCount: Number(o.rolloverCount)||0,
    status: ['active','rolled','settled','defaulted'].includes(o.status) ? o.status : 'active',
    date: /^\d{4}-\d{2}-\d{2}$/.test(o.date||'') ? o.date : todayStr(),
    notes: o.notes || '',
    parentId: o.parentId || null,
    password: o.password || ''
  };
  if(o.daysLate!==undefined && o.daysLate!=='' && !isNaN(Number(o.daysLate))) loan.daysLate = Number(o.daysLate);
  return loan;
}

function parseCsvLoans(text){
  const rows = [];
  let cur = [], field = '', inQ = false;
  for(let i=0;i<text.length;i++){
    const c = text[i];
    if(inQ){
      if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if(c === '"') inQ = true;
    else if(c === ','){ cur.push(field); field=''; }
    else if(c === '\n'){ cur.push(field); rows.push(cur); cur=[]; field=''; }
    else if(c !== '\r') field += c;
  }
  if(field.length || cur.length){ cur.push(field); rows.push(cur); }
  const clean = rows.filter(r=> r.some(v=> String(v).trim()!==''));
  if(clean.length < 2) throw new Error('CSV has no data rows.');
  const head = clean[0].map(h=> h.trim().toLowerCase());
  const idx = name => head.indexOf(name);
  return clean.slice(1).map(r=>{
    const get = n => { const i = idx(n); return i === -1 ? '' : r[i]; };
    return normaliseLoan({
      customer: get('customer'),
      cycleType: (get('cycle')||'new').toLowerCase(),
      rolloverCount: get('rollover #'),
      principal: get('principal'),
      interest: get('interest'),
      totalDue: get('total due'),
      date: get('date'),
      status: (get('status')||'active').toLowerCase(),
      notes: get('notes')
    });
  });
}

function downloadBlob(content, filename, type){
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// AES-256-GCM export, key derived from a user passphrase via PBKDF2 (Web Crypto API,
// fully offline/in-browser — the passphrase itself is never stored or sent anywhere).
async function encryptWithPassphrase(plaintext, passphrase){
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:250000, hash:'SHA-256' },
    keyMaterial,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt']
  );
  const cipherBuf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(plaintext));
  return { salt: Array.from(salt), iv: Array.from(iv), data: btoa(String.fromCharCode(...new Uint8Array(cipherBuf))) };
}

document.getElementById('exportEncBtn').addEventListener('click', ()=>{
  const pass = generateStrongPassphrase();
  document.getElementById('ee_pass').value = pass;
  updatePassphraseStrengthDisplay(pass);
  document.getElementById('exportEncOverlay').classList.add('open');
});
document.getElementById('ee_regenBtn').addEventListener('click', ()=>{
  const pass = generateStrongPassphrase();
  document.getElementById('ee_pass').value = pass;
  updatePassphraseStrengthDisplay(pass);
});
document.getElementById('ee_copyBtn').addEventListener('click', async ()=>{
  const pass = document.getElementById('ee_pass').value;
  try{
    await navigator.clipboard.writeText(pass);
    const btn = document.getElementById('ee_copyBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(()=>{ btn.textContent = original; }, 1200);
  }catch(err){ /* clipboard access denied — user can still select the text manually */ }
});
document.getElementById('ee_cancelBtn').addEventListener('click', ()=>{
  document.getElementById('exportEncOverlay').classList.remove('open');
});
document.getElementById('exportEncForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const pass = document.getElementById('ee_pass').value;
  if(pass.length < 8){ alert('Passphrase generation failed — try reopening the export dialog.'); return; }

  const payload = { app:'tracklend', version:1, exportedAt:new Date().toISOString(), interestRate:INTEREST_RATE, loans };
  const encrypted = await encryptWithPassphrase(JSON.stringify(payload), pass);
  const fileContents = JSON.stringify({ format:'tracklend-aes256-gcm', kdf:'PBKDF2-SHA256', iterations:250000, ...encrypted });

  const stamp = todayStr();
  const filename = 'tracklend-backup-' + stamp + '.enc';
  downloadBlob(fileContents, filename, 'application/octet-stream');

  // Companion Markdown note holding the passphrase, named for the current
  // month so a whole month's backup notes land together in Obsidian.
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const monthSlug = new Date().toISOString().slice(0,7); // YYYY-MM
  const mdFilename = 'TrackLend backup password - ' + monthSlug + '.md';
  const mdContents = [
    '# TrackLend backup password — ' + monthLabel,
    '',
    '- **Backup file:** `' + filename + '`',
    '- **Exported:** ' + new Date().toISOString(),
    '- **Loans included:** ' + loans.length,
    '',
    '## Passphrase',
    '```',
    pass,
    '```',
    '',
    '> Keep this note with (or linked to) the `.enc` file. Without this exact passphrase the backup cannot be decrypted.'
  ].join('\n');
  downloadBlob(mdContents, mdFilename, 'text/markdown');

  document.getElementById('exportEncOverlay').classList.remove('open');
  recordBackup(filename);
  setSettingsStatus('Encrypted backup downloaded — ' + loans.length + ' loans exported. Passphrase saved to ' + mdFilename + '.');
});

// Reverse of encryptWithPassphrase: derives the same key from the passphrase
// + stored salt, then decrypts. Throws if the passphrase is wrong or the
// file is malformed/corrupted.
async function decryptWithPassphrase(fileJson, passphrase){
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const salt = new Uint8Array(fileJson.salt);
  const iv = new Uint8Array(fileJson.iv);
  const cipherBytes = Uint8Array.from(atob(fileJson.data), c=>c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: fileJson.iterations || 250000, hash:'SHA-256' },
    keyMaterial,
    { name:'AES-GCM', length:256 },
    false,
    ['decrypt']
  );
  const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, cipherBytes);
  return dec.decode(plainBuf);
}

let pendingImportFile = null;

document.getElementById('importBtn').addEventListener('click', ()=> document.getElementById('importFile').click());

document.getElementById('importFile').addEventListener('change', e=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(!file.name.toLowerCase().endsWith('.enc')){
    setSettingsStatus('Please choose an AES-256 encrypted backup (.enc) file.', true);
    e.target.value = '';
    return;
  }
  pendingImportFile = file;
  document.getElementById('ie_pass').value = '';
  document.getElementById('importEncOverlay').classList.add('open');
  document.getElementById('ie_pass').focus();
  e.target.value = '';
});

document.getElementById('ie_cancelBtn').addEventListener('click', ()=>{
  document.getElementById('importEncOverlay').classList.remove('open');
  pendingImportFile = null;
});

document.getElementById('importEncForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const file = pendingImportFile;
  if(!file) return;
  const pass = document.getElementById('ie_pass').value;

  try{
    const raw = await file.text();
    const fileJson = JSON.parse(raw);
    if(fileJson.format !== 'tracklend-aes256-gcm' || !fileJson.salt || !fileJson.iv || !fileJson.data){
      throw new Error('Not a valid TrackLend encrypted backup.');
    }
    let plaintext;
    try{
      plaintext = await decryptWithPassphrase(fileJson, pass);
    }catch(_err){
      throw new Error('Wrong passphrase, or the file is corrupted.');
    }
    const parsed = JSON.parse(plaintext);
    const arr = Array.isArray(parsed) ? parsed : parsed.loans;
    if(!Array.isArray(arr)) throw new Error('Decrypted file does not contain a loans list.');
    const incoming = arr.map(normaliseLoan);
    if(!incoming.length) throw new Error('No loans found in that backup.');

    const mode = document.getElementById('importMode').value;
    if(mode === 'replace'){
      loans = incoming;
    } else {
      const seen = new Set(loans.map(l=>l.id));
      incoming.forEach(l=>{
        if(seen.has(l.id)) l.id = genId();
        seen.add(l.id);
        loans.push(l);
      });
    }
    saveLoans(loans);
    render();
    showSettings(true);
    document.getElementById('importEncOverlay').classList.remove('open');
    pendingImportFile = null;
    setSettingsStatus((mode === 'replace' ? 'Data replaced — ' : 'Data merged — ') + incoming.length + ' loans decrypted and loaded from ' + file.name + '.');
  }catch(err){
    setSettingsStatus('Could not import that file: ' + err.message, true);
  }
});

document.getElementById('clearDataBtn').addEventListener('click', ()=>{
  if(!confirm('Delete ALL loan data from this browser? This cannot be undone. Export a backup first if you need it.')) return;
  loans = [];
  saveLoans(loans);
  render();
  showSettings(true);
  setSettingsStatus('All loan data cleared. Upload a backup above to restore.');
});

/* Re-render on resize/rotation so number formatting (full vs short)
   updates live when crossing the mobile breakpoint, instead of only on
   next page load. */
(function initResponsiveRerender(){
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if(typeof render === 'function') render(); }, 200);
  });
})();

/* (The old mobile hamburger drawer and desktop sidebar collapse-toggle
   used to live here — both are gone now that navigation lives in the
   top navigation bar; nothing to initialize.) */
/* ============================================================
   Finance page — document upload + OCR pipeline
   ------------------------------------------------------------
   Uploads a PDF as base64 to POST /api/finance/documents, then
   polls GET /api/finance/documents while any doc is still
   pending/extracting. The server (see server.js + lib/financeOcr.js,
   lib/financeParse.js, lib/financeCategorize.js) extracts the PDF's
   text layer, falls back to Tesseract OCR for scanned documents,
   parses bank-statement lines into transactions, and assigns a
   placeholder category to each — swapped for the real AI
   categorizer in Phase 5 (see the underwriting notes).
   ============================================================ */

const FINANCE_CATEGORIES = ['Rent','Utilities','Food','Gambling','Loan Repayment','Transport','Entertainment','Medical','Other'];
const FINANCE_DOC_TYPES = { bank_statement:'Bank statement', id_document:'ID document', proof_of_address:'Proof of address' };
const FINANCE_POLL_MS = 2000;

let financeDocs = [];        // list from GET /api/finance/documents (no file bytes)
let financeSelectedDocId = null;
let financePollTimer = null;
let financeDocFilter = 'all';        // filter chips on the document list
let financeDocCustomerFilter = 'all'; // customer dropdown on the document list

function financeDocIcon(type){
  if(type==='id_document') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12" r="2"/><path d="M13 10h5M13 14h5"/></svg>';
  if(type==='proof_of_address') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>';
}

function populateFinanceCustomerList(){
  const list = document.getElementById('finCustomerList');
  if(!list) return;
  const names = Array.from(new Set(loans.map(l=>l.customer))).sort((a,b)=>a.localeCompare(b));
  list.innerHTML = names.map(n=>`<option value="${n}"></option>`).join('');
}

function fileToBase64(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result.split(',')[1]); // strip the data: URL prefix
    reader.onerror = ()=> reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

function notifyDocUploadedByEmail(filename, customer){
  if(!prefs.notifyEvents || !prefs.notifyEvents.docUploaded) return;
  const to = prefs.notifyEmail;
  if(!to) return;
  fetch(API_BASE + '/api/notify', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ to, subject: `Document uploaded — ${customer}`, text: `"${filename}" was uploaded for ${customer} on the Finance page.` })
  }).catch(()=>{});
}

async function addFinanceFiles(fileList){
  const type = document.getElementById('finDocType').value;
  const customer = document.getElementById('finCustomer').value.trim();

  for(const file of Array.from(fileList)){
    if(file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){
      alert(`"${file.name}" isn't a PDF — only PDF documents are supported right now.`);
      continue;
    }
    try{
      const fileData = await fileToBase64(file);
      const res = await authFetch(API_BASE + '/api/finance/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type, customer: customer || 'Unassigned', fileData })
      });
      if(!res.ok){
        const err = await res.json().catch(()=>({}));
        throw new Error(err.error || 'Upload failed.');
      }
      notifyDocUploadedByEmail(file.name, customer || 'Unassigned');
    }catch(err){
      console.error('Finance upload failed:', err);
      alert(`Failed to upload "${file.name}": ${err.message}`);
    }
  }

  await loadFinanceDocuments();
  startFinancePolling();
}

async function loadFinanceDocuments(){
  try{
    const res = await authFetch(API_BASE + '/api/finance/documents');
    if(!res.ok) throw new Error('Could not load documents.');
    financeDocs = await res.json();
  }catch(err){
    console.error('Failed to load finance documents:', err);
  }
  renderFinanceDocs();
  if(financeSelectedDocId){
    const stillThere = financeDocs.find(d=>d.id===financeSelectedDocId);
    if(!stillThere) financeSelectedDocId = null;
  }
}

function startFinancePolling(){
  stopFinancePolling();
  financePollTimer = setInterval(async ()=>{
    const stillProcessing = financeDocs.some(d=> d.status==='pending' || d.status==='extracting');
    if(!stillProcessing){ stopFinancePolling(); return; }
    await loadFinanceDocuments();
  }, FINANCE_POLL_MS);
}
function stopFinancePolling(){
  if(financePollTimer){ clearInterval(financePollTimer); financePollTimer = null; }
}

async function removeFinanceDoc(docId){
  try{
    const res = await authFetch(API_BASE + '/api/finance/documents/' + docId, { method: 'DELETE' });
    if(!res.ok) throw new Error('Delete failed.');
  }catch(err){
    console.error('Failed to delete finance document:', err);
    alert('Could not delete that document.');
    return;
  }
  if(financeSelectedDocId === docId){
    financeSelectedDocId = null;
  }
  await loadFinanceDocuments();
}

function selectFinanceDoc(docId){
  financeSelectedDocId = docId;
  renderFinanceDocs();
}

function renderFinanceDocs(){
  const wrap = document.getElementById('finDocList');
  if(!wrap) return;
  const countEl = document.getElementById('finDocCount');
  if(countEl) countEl.textContent = financeDocs.length ? (financeDocs.length + (financeDocs.length===1?' document':' documents')) : '';

  // If the currently selected customer no longer has any documents
  // (e.g. their last one was removed), fall back to showing all.
  const customers = [...new Set(financeDocs.map(d=>d.customer))];
  if(financeDocCustomerFilter!=='all' && !customers.includes(financeDocCustomerFilter)){
    financeDocCustomerFilter = 'all';
  }

  let visibleDocs = financeDocFilter==='all' ? financeDocs : financeDocs.filter(d=>d.type===financeDocFilter);
  if(financeDocCustomerFilter!=='all') visibleDocs = visibleDocs.filter(d=>d.customer===financeDocCustomerFilter);

  if(!financeDocs.length){
    wrap.innerHTML = '<div class="fin-empty">No documents uploaded yet.</div>';
    return;
  }
  if(!visibleDocs.length){
    wrap.innerHTML = '<div class="fin-empty">No documents match this filter.</div>';
    return;
  }
  wrap.innerHTML = visibleDocs.map(d=>`
    <div class="fin-doc-item${d.id===financeSelectedDocId?' selected':''}" data-doc="${d.id}">
      <div class="fin-doc-icon">${financeDocIcon(d.type)}</div>
      <div class="fin-doc-main">
        <div class="fin-doc-name">${d.name}</div>
        <div class="fin-doc-sub">${FINANCE_DOC_TYPES[d.type] || d.type} · ${d.customer}${d.status==='failed' && d.errorMessage ? ' · ' + d.errorMessage : ''}</div>
      </div>
      <span class="fin-status-pill ${d.status}">${d.status}</span>
      <button class="fin-doc-remove" data-remove="${d.id}" title="Remove">✕</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-doc]').forEach(el=>{
    el.addEventListener('click', e=>{
      if(e.target.closest('[data-remove]')) return;
      selectFinanceDoc(el.dataset.doc);
    });
  });
  wrap.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      removeFinanceDoc(btn.dataset.remove);
    });
  });
}

(function initFinanceTxnControls(){
  document.getElementById('finDocFilters')?.addEventListener('click', e=>{
    const btn = e.target.closest('[data-filter]');
    if(!btn) return;
    financeDocFilter = btn.dataset.filter;
    document.querySelectorAll('#finDocFilters .fin-chip').forEach(c=>c.classList.toggle('active', c===btn));
    renderFinanceDocs();
  });
})();

function populateFinCustomerPanel(){
  const list = document.getElementById('finCustomerPanelList');
  if(!list) return;
  const customers = [...new Set(financeDocs.map(d=>d.customer))].sort((a,b)=>a.localeCompare(b));
  const names = ['all', ...customers];
  list.innerHTML = names.map(c=>`
    <div class="client-panel-item${financeDocCustomerFilter===c?' active':''}" data-customer="${c}">
      <span>${c==='all'?'All customers':c}</span>
      <span class="check">✓</span>
    </div>
  `).join('');
  list.querySelectorAll('[data-customer]').forEach(el=>{
    el.addEventListener('click', ()=>{
      financeDocCustomerFilter = el.dataset.customer;
      renderFinanceDocs();
      closeFinCustomerPanel();
    });
  });
}
function openFinCustomerPanel(){
  populateFinCustomerPanel();
  document.getElementById('finCustomerPanel').classList.add('open');
  document.getElementById('finCustomerPanelBackdrop').classList.add('open');
}
function closeFinCustomerPanel(){
  document.getElementById('finCustomerPanel').classList.remove('open');
  document.getElementById('finCustomerPanelBackdrop').classList.remove('open');
}
document.getElementById('finDocCustomerBtn')?.addEventListener('click', openFinCustomerPanel);
document.getElementById('finCustomerPanelClose')?.addEventListener('click', closeFinCustomerPanel);
document.getElementById('finCustomerPanelBackdrop')?.addEventListener('click', closeFinCustomerPanel);

(function initFinanceUpload(){
  const dropzone = document.getElementById('finDropzone');
  const input = document.getElementById('finFileInput');
  if(!dropzone || !input) return;

  dropzone.addEventListener('click', ()=> input.click());
  input.addEventListener('change', ()=>{
    if(input.files.length) addFinanceFiles(input.files);
    input.value = '';
  });
  ['dragenter','dragover'].forEach(evt=>{
    dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(evt=>{
    dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', e=>{
    if(e.dataTransfer.files.length) addFinanceFiles(e.dataTransfer.files);
  });
})();

/* ============================================================
   Risk page — combined loan-history + spending-behavior profile
   ------------------------------------------------------------
   Loan-history risk (assessRisk) already existed for the "new
   loan" modal. This page adds a second, independent signal —
   spending behavior pulled from the customer's uploaded bank
   statements (see the Finance page) — and shows both side by
   side, per customer. This combined view is intentionally only
   shown here, not folded into the modal's quick risk-panel.
   ============================================================ */

function populateRiskCustomerList(){
  const list = document.getElementById('riskCustomerList');
  if(!list) return;
  const names = Array.from(new Set(loans.map(l=>l.customer))).sort((a,b)=>a.localeCompare(b));
  list.innerHTML = names.map(n=>`<option value="${n}"></option>`).join('');
}

// Turns a customer's finance_transactions category totals into risk
// notes + a score penalty. This is a first-pass heuristic, not a
// scoring model — thresholds can be tuned once real statements are
// flowing through it.
function financeRiskAdjustment(categories){
  const total = categories.reduce((s,c)=>s + Number(c.total||0), 0);
  const notes = []; // { text, level: 'high'|'medium' }
  let penalty = 0;

  if(!total){
    return { total: 0, penalty: 0, notes: [] };
  }

  const pctOf = cat => {
    const row = categories.find(c=>c.category===cat);
    return row ? Math.round(Number(row.total)/total*100) : 0;
  };

  const gamblingPct = pctOf('Gambling');
  if(gamblingPct >= 20){
    penalty += 20;
    notes.push({ text:`Gambling transactions make up ${gamblingPct}% of tracked spending — significant risk indicator.`, level:'high' });
  } else if(gamblingPct >= 5){
    penalty += 8;
    notes.push({ text:`Gambling transactions make up ${gamblingPct}% of tracked spending.`, level:'medium' });
  }

  const loanRepayPct = pctOf('Loan Repayment');
  if(loanRepayPct >= 30){
    penalty += 6;
    notes.push({ text:`Existing loan repayments make up ${loanRepayPct}% of tracked spending — limited extra repayment capacity.`, level:'medium' });
  }

  const rentUtilPct = pctOf('Rent') + pctOf('Utilities');
  if(rentUtilPct >= 60){
    notes.push({ text:`Rent and utilities make up ${rentUtilPct}% of tracked spending — little slack in the budget.`, level:'medium' });
  }

  return { total, penalty, notes };
}

async function loadRiskProfile(customer){
  const wrap = document.getElementById('riskProfileWrap');
  const empty = document.getElementById('riskEmptyState');
  const featureGrid = document.getElementById('riskFeatureGrid');

  if(!customer){
    wrap.style.display = 'none';
    empty.style.display = '';
    if(featureGrid) featureGrid.innerHTML = '';
    return;
  }
  empty.style.display = 'none';
  wrap.style.display = '';

  // ---- loan history panel (existing logic, reused as-is) ----
  const loanPanel = document.getElementById('riskLoanPanel');
  const a = assessRisk(customer);
  const scoreTxt = a.score===null ? '' : ` · Score ${a.score}/100`;
  const reasonsHTML = a.reasons.length ? `<ul class="risk-reasons">${a.reasons.map(r=>`<li>${r}</li>`).join('')}</ul>` : '';
  loanPanel.innerHTML = `<div class="risk-badge ${a.level}">${a.label}${scoreTxt}</div>
    <div class="risk-reco">${a.recommendation}</div>
    ${reasonsHTML}`;

  // ---- spending behavior panel (from uploaded bank statements) ----
  const financePanel = document.getElementById('riskFinancePanel');
  financePanel.innerHTML = '<div class="fin-empty">Loading…</div>';

  let summary;
  try{
    const res = await authFetch(API_BASE + '/api/finance/summary/' + encodeURIComponent(customer));
    if(!res.ok) throw new Error('Could not load finance summary.');
    summary = await res.json();
  }catch(err){
    console.error('Failed to load finance summary:', err);
    financePanel.innerHTML = '<div class="fin-empty">Could not load spending data.</div>';
    if(featureGrid) featureGrid.innerHTML = riskFeatureGridHTML(customer, blendedRiskFromCategories(customer, null), riskEventBreakdown(customer, null), null);
    return;
  }

  // Stale guard: if the customer changed while this was loading, drop it.
  if(document.getElementById('riskCustomer').value.trim() !== customer) return;

  const hasStatements = summary.documents.some(d=>d.type==='bank_statement');
  const categories = hasStatements ? summary.categories : null;

  if(featureGrid){
    const blended = blendedRiskFromCategories(customer, categories && categories.length ? categories : null);
    const breakdown = riskEventBreakdown(customer, categories && categories.length ? categories : null);
    featureGrid.innerHTML = riskFeatureGridHTML(customer, blended, breakdown, categories);
  }

  if(!hasStatements){
    financePanel.innerHTML = '<div class="fin-empty">No bank statements uploaded for this customer yet — upload one on the Finance page to see spending behavior here.</div>';
    return;
  }
  if(!summary.categories.length){
    financePanel.innerHTML = '<div class="fin-empty">Bank statement uploaded but no transactions could be extracted yet — check the Finance page for processing status.</div>';
    return;
  }

  const { total, notes } = financeRiskAdjustment(summary.categories);
  const notesHTML = notes.map(n=>`<div class="risk-flag-note${n.level==='medium'?' medium':''}">${n.text}</div>`).join('');

  const barsHTML = summary.categories.map(c=>{
    const pct = total ? Math.round(Number(c.total)/total*100) : 0;
    const flagClass = c.category==='Gambling' && pct>=20 ? 'flag-high' : c.category==='Gambling' && pct>=5 ? 'flag-medium' : '';
    return `
      <div class="risk-spend-row">
        <div class="risk-spend-label">${c.category}</div>
        <div class="risk-spend-track"><div class="risk-spend-fill ${flagClass}" style="width:${pct}%"></div></div>
        <div class="risk-spend-amt">R${Number(c.total).toLocaleString()} (${pct}%)</div>
      </div>`;
  }).join('');

  financePanel.innerHTML = `${notesHTML}${barsHTML}`;
}

(function initRiskCustomerPicker(){
  const input = document.getElementById('riskCustomer');
  if(!input) return;
  input.addEventListener('change', ()=> loadRiskProfile(input.value.trim()));
  input.addEventListener('input', ()=>{
    const names = Array.from(new Set(loans.map(l=>l.customer)));
    if(names.includes(input.value.trim())) loadRiskProfile(input.value.trim());
  });
})();

/* (The dashboard's "Filter by client" button and slide-in panel used to
   live here — removed at the owner's request since it wasn't used.
   Client scoping still exists in the data model: pressing Enter in the
   top-nav search scopes the dashboard to that customer, and clearing the
   search box resets it to all clients.) */

// Top-bar "Export .CSV" — dumps the current (client-scoped) loan list as
// a plain CSV the user can open in Excel/Sheets. Client-side only, no
// server round-trip needed since `loans` is already in memory.
document.getElementById('exportCsvBtn')?.addEventListener('click', ()=>{
  const rows = clientScoped();
  const header = ['Loan Code','Customer','Principal','Interest','Total Due','Date Issued','Repayment Date','Status'];
  const lines = [header.join(',')];
  rows.forEach(l=>{
    const line = [
      loanCode(l), l.customer, l.principal, l.interest, l.totalDue,
      l.date || '', l.repaymentDate || '', l.status
    ].map(v=> `"${String(v??'').replace(/"/g,'""')}"`).join(',');
    lines.push(line);
  });
  const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tracklend-loans-${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Loads this account's business data from the server and renders the
// dashboard. Used to run automatically at script load, in parallel with
// the login screen — but since every business-data endpoint now requires
// an auth token (TrackLend is multi-tenant), it can only run AFTER a
// successful sign-in/sign-up, so it's called explicitly from those flows
// instead (see initBootAndAuth below).
async function loadAppData(){
  try{
    const [serverLoans, serverPrefs, serverExpenses, serverProfiles] = await Promise.all([loadLoansFromServer(), loadPrefsFromServer(), loadExpensesFromServer(), loadCustomerProfilesFromServer()]);
    loans = serverLoans;
    const defaults = defaultPrefs();
    prefs = Object.assign({}, defaults, serverPrefs, {
      stats: Object.assign({}, defaults.stats, serverPrefs && serverPrefs.stats),
      notifyEvents: Object.assign({}, defaults.notifyEvents, serverPrefs && serverPrefs.notifyEvents),
      dateRange: Object.assign({}, defaults.dateRange, serverPrefs && serverPrefs.dateRange)
    });
    // preferredInterestRate comes from the Sign Up form — falls back to
    // the default INTEREST_RATE above if it was never set.
    if (prefs.preferredInterestRate !== undefined && prefs.preferredInterestRate !== null && prefs.preferredInterestRate !== '') {
      const rate = Number(prefs.preferredInterestRate);
      if (!isNaN(rate) && rate >= 0) INTEREST_RATE = rate / 100;
    }
    expenses = serverExpenses;
    customerProfiles = serverProfiles;
  }catch(err){
    console.error(err);
    alert('Could not reach the server. Check your connection and reload the page.');
  }
  render();
  showPage('dashboard');
  document.getElementById('notifyEmailInput').value = prefs.notifyEmail || '';
  initSettingsControls();
}

/* ---------- boot ----------
   Short logo splash, then straight into the dashboard — no login screen
   (single-owner site; access is gated at the host with APP_PASSWORD). */
(function initBoot(){
  const splash = document.getElementById('bootSplash');
  const appRoot = document.getElementById('appRoot');
  if(!appRoot) return;
  const dataReady = loadAppData();
  const minSplash = new Promise(r=> setTimeout(r, splash ? 1400 : 0));
  Promise.all([dataReady, minSplash]).then(()=>{
    appRoot.style.display = '';
    if(splash){
      splash.classList.add('fade-out');
      setTimeout(()=>{ splash.style.display = 'none'; }, 500);
    }
  });
})();

// ---------- Custom dropdown (replaces native <select> popups) ----------
// Windows renders native <select> option lists with the OS accent-color
// highlight, which we can't restyle directly. Instead, each <select> is
// wrapped in a small custom menu that mirrors it: the real <select>
// stays in the DOM (invisible, inert) so every existing bit of code that
// reads/sets `.value` or listens for 'change' keeps working untouched —
// this is purely a visual layer on top.
function enhanceSelects(root){
  (root || document).querySelectorAll('select:not([data-enhanced])').forEach(sel=>{
    sel.dataset.enhanced = '1';
    buildCustomSelect(sel);
  });
}

function buildCustomSelect(sel){
  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.innerHTML = `<span class="custom-select-trigger-label"></span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`;
  wrap.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  wrap.appendChild(menu);

  const labelEl = trigger.querySelector('.custom-select-trigger-label');

  function syncFromSelect(){
    const opts = Array.from(sel.options);
    const current = opts.find(o=>o.value===sel.value) || opts[0];
    labelEl.textContent = current ? current.textContent : '';
    menu.innerHTML = opts.map(o=>
      `<div class="custom-select-option${o.value===sel.value?' selected':''}" data-value="${o.value.replace(/"/g,'&quot;')}">${o.textContent}</div>`
    ).join('');
    menu.querySelectorAll('.custom-select-option').forEach(optEl=>{
      optEl.addEventListener('click', ()=>{
        if(sel.value !== optEl.dataset.value){
          sel.value = optEl.dataset.value;
          sel.dispatchEvent(new Event('change', { bubbles:true }));
        }
        closeMenu();
        syncFromSelect();
      });
    });
  }

  function openMenu(){
    document.querySelectorAll('.custom-select.open').forEach(o=>{ if(o!==wrap) o.classList.remove('open'); });
    syncFromSelect();
    wrap.classList.add('open');
  }
  function closeMenu(){ wrap.classList.remove('open'); }

  trigger.addEventListener('click', e=>{
    e.stopPropagation();
    if(sel.disabled) return;
    wrap.classList.contains('open') ? closeMenu() : openMenu();
  });

  // Expose a manual refresh hook for the rare case code sets sel.value
  // directly without dispatching 'change' (see d_status in openLoanDetail).
  wrap._syncCustomSelect = syncFromSelect;

  syncFromSelect();
}

function refreshCustomSelect(id){
  const sel = document.getElementById(id);
  const wrap = sel && sel.closest('.custom-select');
  if(wrap && wrap._syncCustomSelect) wrap._syncCustomSelect();
}

document.addEventListener('click', ()=>{
  document.querySelectorAll('.custom-select.open').forEach(w=>w.classList.remove('open'));
});

enhanceSelects(document);
// Re-scan whenever new <select> elements can appear (finance transaction
// table rows, etc.) — cheap since already-enhanced selects are skipped.
new MutationObserver(()=> enhanceSelects(document)).observe(document.body, { childList:true, subtree:true });

/* ─────────────────────────────────────────────────────────────
   Top-nav search toggle (the bx-grid-search button next to the
   page pills). Click once: the customer search bar slides out
   from the left into its fixed position and takes focus.
   Click again: it simply fades away (no slide back).
   ───────────────────────────────────────────────────────────── */
(function(){
  const btn = document.getElementById('searchToggleBtn');
  const box = document.getElementById('topnavSearch');
  if(!btn || !box) return;
  const input = box.querySelector('input');

  function openSearch(){
    box.classList.remove('closing');
    // force a reflow so the slide-in transition always replays
    void box.offsetWidth;
    box.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded','true');
    setTimeout(()=> input && input.focus(), 120);
  }

  function closeSearch(){
    if(!box.classList.contains('open')) return;
    box.classList.remove('open');
    box.classList.add('closing');          // fade out in place
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded','false');
    setTimeout(()=> box.classList.remove('closing'), 260);
    clearSearch();
  }

  /* Closing the bar always resets the search: the query is wiped, any
     client scoping the query applied is dropped, and every view is
     re-rendered so the full data set comes back. */
  function clearSearch(){
    if(!input) return;
    const hadQuery = input.value.trim() !== '';
    input.value = '';
    input.blur();
    if(prefs.client !== 'all'){
      prefs.client = 'all';
      savePrefs();
      render();
    } else if(!hadQuery){
      return;                 // nothing was typed — nothing to restore
    } else {
      render();
    }
    renderTable();            // loans table / kanban back to the full list
    if(typeof renderCustomers === 'function') renderCustomers();
  }

  btn.addEventListener('click', e=>{
    e.preventDefault();
    e.stopPropagation();
    box.classList.contains('open') ? closeSearch() : openSearch();
  });

  // Clicking anywhere outside, or pressing Escape, closes it too.
  document.addEventListener('click', e=>{
    if(!box.classList.contains('open')) return;
    if(box.contains(e.target) || btn.contains(e.target)) return;
    closeSearch();
  });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape') closeSearch();
  });
})();

/* ─────────────────────────────────────────────────────────────
   Hero card date-range picker — replaced the redundant hero
   "New Loan" button. Selecting a period re-renders the hero
   total, the four stat cards and the disbursements chart.
   ───────────────────────────────────────────────────────────── */
function renderDateRangeUI(range){
  const labelEl = document.getElementById('dateRangeLabel');
  if(labelEl) labelEl.textContent = range.label;
  document.querySelectorAll('#dateRangeMenu .date-range-option').forEach(opt=>{
    opt.classList.toggle('selected', opt.dataset.mode === range.mode);
  });
}

(function(){
  const wrap    = document.getElementById('dateRange');
  const trigger = document.getElementById('dateRangeTrigger');
  const menu    = document.getElementById('dateRangeMenu');
  const panel   = document.getElementById('dateRangeCustomPanel');
  const startEl = document.getElementById('dateRangeStart');
  const endEl   = document.getElementById('dateRangeEnd');
  const errEl   = document.getElementById('dateRangeError');
  if(!wrap || !trigger || !menu) return;

  function closeMenu(){
    wrap.classList.remove('open','custom-open');
    trigger.setAttribute('aria-expanded','false');
    if(errEl) errEl.textContent = '';
  }
  function openMenu(){
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded','true');
  }

  trigger.addEventListener('click', e=>{
    e.stopPropagation();
    wrap.classList.contains('open') ? closeMenu() : openMenu();
  });

  menu.querySelectorAll('.date-range-option').forEach(opt=>{
    opt.addEventListener('click', e=>{
      e.stopPropagation();
      const mode = opt.dataset.mode;

      // "Custom range" reveals the start/end picker instead of
      // selecting a period straight away.
      if(mode === 'custom'){
        const dr = dateRangePrefs();
        const now = new Date();
        if(startEl) startEl.value = dr.start || localDateKey(startOfMonth(now));
        if(endEl)   endEl.value   = dr.end   || localDateKey(now);
        wrap.classList.add('custom-open');
        setTimeout(()=> startEl && startEl.focus(), 60);
        return;
      }

      const dr = dateRangePrefs();
      dr.mode = mode; dr.start = ''; dr.end = '';
      savePrefs();
      closeMenu();
      render();                      // hero + stat cards + chart
    });
  });

  document.getElementById('dateRangeCancel')?.addEventListener('click', e=>{
    e.stopPropagation();
    wrap.classList.remove('custom-open');
    if(errEl) errEl.textContent = '';
  });

  document.getElementById('dateRangeApply')?.addEventListener('click', e=>{
    e.stopPropagation();
    const s = startEl.value, en = endEl.value;
    if(!s || !en){ errEl.textContent = 'Pick both a start and an end date.'; return; }
    if(s > en){ errEl.textContent = 'The start date must be on or before the end date.'; return; }
    const dr = dateRangePrefs();
    dr.mode = 'custom'; dr.start = s; dr.end = en;
    savePrefs();
    closeMenu();
    render();
  });

  // Click-away / Escape close the dropdown.
  document.addEventListener('click', e=>{
    if(wrap.classList.contains('open') && !wrap.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && wrap.classList.contains('open')) closeMenu();
  });
})();
