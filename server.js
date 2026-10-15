// server.js — TrackLend web server (single owner, Turso/libSQL storage).
//
// Env vars:
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN  — hosted database (required on Render)
//                                           with neither set, falls back to a local
//                                           file (file:local.db) for development.
//   APP_PASSWORD   — if set, the whole site is behind a browser login prompt
//                    (any username, this password). STRONGLY recommended: the
//                    site holds customer ID numbers and loan data.
//   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM — email notifications
//   BUSINESS_EMAIL, BUSINESS_NAME, DEFAULT_INTEREST_RATE (percent) — optional defaults

const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    customer TEXT,
    principal REAL,
    interest REAL,
    totalDue REAL,
    cycleType TEXT,
    rolloverCount INTEGER,
    status TEXT,
    date TEXT,
    repaymentDate TEXT,
    notes TEXT,
    parentId TEXT,
    password TEXT,
    daysLate INTEGER
  );

  CREATE TABLE IF NOT EXISTS prefs (
    id INTEGER PRIMARY KEY,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    description TEXT,
    amount REAL,
    category TEXT,
    date TEXT,
    notes TEXT,
    type TEXT
  );

  CREATE TABLE IF NOT EXISTS customer_profiles (
    customer TEXT PRIMARY KEY,
    customerId TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    province TEXT,
    town TEXT,
    idNumber TEXT,
    notes TEXT,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS finance_documents (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    customer TEXT,
    status TEXT,
    uploadedAt TEXT,
    fileData TEXT,
    mimeType TEXT,
    errorMessage TEXT,
    extractedName TEXT,
    extractedIdNumber TEXT,
    extractedAddress TEXT,
    extractedPhone TEXT
  );

  CREATE TABLE IF NOT EXISTS finance_transactions (
    id TEXT PRIMARY KEY,
    documentId TEXT,
    date TEXT,
    description TEXT,
    amount REAL,
    category TEXT
  );

`;

// One-off column additions for databases created before a field existed.
// CREATE TABLE IF NOT EXISTS won't add columns to an already-existing
// table, so these run every startup and just no-op (throw, caught below)
// once the column is already there.
const MIGRATIONS = [
  `ALTER TABLE loans ADD COLUMN repaymentDate TEXT`,
  `ALTER TABLE expenses ADD COLUMN type TEXT`,
  `ALTER TABLE expenses ADD COLUMN receipt TEXT`,
  `ALTER TABLE customer_profiles ADD COLUMN customerId TEXT`,
  `ALTER TABLE customer_profiles ADD COLUMN createdAt TEXT`,
  `ALTER TABLE customer_profiles ADD COLUMN province TEXT`,
  `ALTER TABLE customer_profiles ADD COLUMN town TEXT`,
  `ALTER TABLE finance_documents ADD COLUMN mimeType TEXT`,
  `ALTER TABLE finance_documents ADD COLUMN extractedName TEXT`,
  `ALTER TABLE finance_documents ADD COLUMN extractedIdNumber TEXT`,
  `ALTER TABLE finance_documents ADD COLUMN extractedAddress TEXT`,
  `ALTER TABLE finance_documents ADD COLUMN extractedPhone TEXT`
];

// Every table carries an ownerId column (left over from the multi-account
// version). This site has exactly one owner, so every row uses OWNER.
const OWNER_MIGRATIONS = [
  'ALTER TABLE loans ADD COLUMN ownerId TEXT',
  'ALTER TABLE customer_profiles ADD COLUMN ownerId TEXT',
  'ALTER TABLE finance_documents ADD COLUMN ownerId TEXT',
  'ALTER TABLE expenses ADD COLUMN ownerId TEXT',
  'ALTER TABLE prefs ADD COLUMN ownerId TEXT'
];
const OWNER = 'owner';

let db;

async function setupDb() {
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, 'local.db'),
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  const toRows = (res) => res.rows.map(row => { const o = {}; res.columns.forEach((c, i) => { o[c] = row[i]; }); return o; });

  for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await client.execute(stmt);
  for (const stmt of MIGRATIONS.concat(OWNER_MIGRATIONS)) {
    try { await client.execute(stmt); } catch (e) { /* column already exists */ }
  }
  return {
    async all(sql, params = []) { return toRows(await client.execute({ sql, args: params })); },
    async run(sql, params = []) { await client.execute({ sql, args: params }); },
    async tx(fn) {
      const t = await client.transaction();
      try {
        await fn({
          all: async (sql, params = []) => toRows(await t.execute({ sql, args: params })),
          run: async (sql, params = []) => { await t.execute({ sql, args: params }); }
        });
        await t.commit();
      } catch (err) { await t.rollback(); throw err; }
    }
  };
}

// Optional site-wide password gate (HTTP Basic Auth).
function basicAuthGate(req, res, next) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return next();
  const given = (Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':'));
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  if ((req.headers.authorization || '').startsWith('Basic ') && crypto.timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="TrackLend", charset="UTF-8"');
  res.status(401).send('Password required.');
}

const ready = (async () => {
  db = await setupDb();
  console.log('Database ready.');

  app.set('trust proxy', 1);
  app.use(basicAuthGate);
  app.use(express.json({ limit: '25mb' }));
  // Only ./public is served — never the project root (that would expose .env, server.js, local.db).
  app.use(express.static(path.join(__dirname, 'public')));

  // Single-owner: every request acts as OWNER.
  function requireAuth(req, res, next) { req.userId = OWNER; next(); }

  // ---------- loans API ----------
  app.get('/api/loans', requireAuth, async (req, res) => {
    const rows = await db.all('SELECT * FROM loans WHERE ownerId = ?', [req.userId]);
    const loans = rows.map(r => {
      if (r.daysLate === null || r.daysLate === undefined) delete r.daysLate;
      if (!r.repaymentDate) delete r.repaymentDate;
      return r;
    });
    res.json(loans);
  });

  // Replace the entire loan book in one call — mirrors the old
  // saveLoans(loans) pattern from localStorage, so the rest of the
  // app's logic doesn't need to change. Scoped to this account only —
  // the DELETE must never touch other accounts' rows.
  app.put('/api/loans', requireAuth, async (req, res) => {
    const loans = req.body;
    if (!Array.isArray(loans)) return res.status(400).json({ error: 'Expected an array of loans.' });

    try {
      await db.tx(async (t) => {
        await t.run('DELETE FROM loans WHERE ownerId = ?', [req.userId]);
        for (const l of loans) {
          await t.run(
            `INSERT INTO loans (id, customer, principal, interest, totalDue,
              cycleType, rolloverCount, status, date, repaymentDate, notes, parentId, password, daysLate, ownerId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              l.id,
              l.customer || '',
              Number(l.principal) || 0,
              Number(l.interest) || 0,
              Number(l.totalDue) || 0,
              l.cycleType || 'new',
              Number(l.rolloverCount) || 0,
              l.status || 'active',
              l.date || '',
              l.repaymentDate || '',
              l.notes || '',
              l.parentId || null,
              l.password || '',
              l.daysLate === undefined ? null : Number(l.daysLate),
              req.userId
            ]
          );
        }
      });
      res.json({ ok: true, count: loans.length });
    } catch (err) {
      console.error('Failed to save loans:', err);
      res.status(500).json({ error: 'Failed to save loans.' });
    }
  });

  // ---------- expenses API ----------
  app.get('/api/expenses', requireAuth, async (req, res) => {
    const rows = await db.all('SELECT * FROM expenses WHERE ownerId = ?', [req.userId]);
    res.json(rows);
  });

  // Replace the entire expense list in one call, same pattern as loans.
  app.put('/api/expenses', requireAuth, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected an array of expenses.' });

    try {
      await db.tx(async (t) => {
        await t.run('DELETE FROM expenses WHERE ownerId = ?', [req.userId]);
        for (const e of items) {
          await t.run(
            `INSERT INTO expenses (id, description, amount, category, date, notes, type, receipt, ownerId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              e.id,
              e.description || '',
              Number(e.amount) || 0,
              e.category || 'Other',
              e.date || '',
              e.notes || '',
              e.type || '',
              e.receipt || '',
              req.userId
            ]
          );
        }
      });
      res.json({ ok: true, count: items.length });
    } catch (err) {
      console.error('Failed to save expenses:', err);
      res.status(500).json({ error: 'Failed to save expenses.' });
    }
  });

  // ---------- customer profiles API (optional personal info) ----------
  app.get('/api/customer-profiles', requireAuth, async (req, res) => {
    const rows = await db.all('SELECT * FROM customer_profiles WHERE ownerId = ?', [req.userId]);
    res.json(rows);
  });

  app.put('/api/customer-profiles', requireAuth, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected an array of customer profiles.' });

    try {
      await db.tx(async (t) => {
        await t.run('DELETE FROM customer_profiles WHERE ownerId = ?', [req.userId]);
        for (const p of items) {
          if (!p.customer) continue;
          await t.run(
            `INSERT INTO customer_profiles (customer, customerId, phone, email, address, province, town, idNumber, notes, createdAt, ownerId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [p.customer, p.customerId || '', p.phone || '', p.email || '', p.address || '', p.province || '', p.town || '', p.idNumber || '', p.notes || '', p.createdAt || '', req.userId]
          );
        }
      });
      res.json({ ok: true, count: items.length });
    } catch (err) {
      console.error('Failed to save customer profiles:', err);
      res.status(500).json({ error: 'Failed to save customer profiles.' });
    }
  });

  // ---------- finance documents API (OCR pipeline) ----------
  // Frontend flow: POST the file as base64 -> row is created with
  // status 'pending' and the response returns immediately -> processing
  // runs in the background -> frontend polls GET /api/finance/documents
  // until status is 'extracted'/'failed', then fetches transactions.
  // Loaded lazily so the heavy OCR dependencies only cost memory when a document is uploaded.
  const lib = (name) => require('./lib/' + name);

  app.get('/api/finance/documents', requireAuth, async (req, res) => {
    const rows = await db.all(
      `SELECT id, name, type, customer, status, uploadedAt, errorMessage,
              extractedName, extractedIdNumber, extractedAddress, extractedPhone
       FROM finance_documents WHERE ownerId = ? ORDER BY uploadedAt DESC`,
      [req.userId]
    );
    res.json(rows);
  });

  app.get('/api/finance/documents/:id/transactions', requireAuth, async (req, res) => {
    // finance_transactions has no ownerId of its own — ownership is via
    // its parent document, so confirm that document belongs to this
    // account before returning anything.
    const docRows = await db.all('SELECT id FROM finance_documents WHERE id = ? AND ownerId = ?', [req.params.id, req.userId]);
    if (!docRows.length) return res.status(404).json({ error: 'Document not found.' });
    const rows = await db.all(
      'SELECT * FROM finance_transactions WHERE documentId = ? ORDER BY date',
      [req.params.id]
    );
    res.json(rows);
  });

  app.post('/api/finance/documents', requireAuth, async (req, res) => {
    const { name, type, customer, fileData, mimeType } = req.body || {};
    if (!name || !type || !fileData) {
      return res.status(400).json({ error: 'name, type and fileData (base64) are required.' });
    }
    if (!['bank_statement', 'id_document', 'proof_of_address'].includes(type)) {
      return res.status(400).json({ error: 'Unrecognized document type.' });
    }

    const id = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const uploadedAt = new Date().toISOString();

    try {
      await db.run(
        `INSERT INTO finance_documents (id, name, type, customer, status, uploadedAt, fileData, mimeType, errorMessage, ownerId)
         VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, NULL, ?)`,
        [id, name, type, customer || 'Unassigned', uploadedAt, fileData, mimeType || 'application/pdf', req.userId]
      );
    } catch (err) {
      console.error('Failed to save finance document:', err);
      return res.status(500).json({ error: 'Failed to save document.' });
    }

    res.json({ ok: true, id });

    // Runs after the response is sent — the frontend polls for status
    // rather than waiting on this request.
    processFinanceDocument(id).catch(err => console.error(`Finance processing error for ${id}:`, err));
  });

  // Lets the New Customer form poll a just-uploaded ID/proof-of-address
  // document until OCR + parsing finishes, without pulling in every
  // other document's fileData.
  app.get('/api/finance/documents/:id', requireAuth, async (req, res) => {
    const rows = await db.all(
      `SELECT id, name, type, customer, status, uploadedAt, errorMessage,
              extractedName, extractedIdNumber, extractedAddress, extractedPhone
       FROM finance_documents WHERE id = ? AND ownerId = ?`,
      [req.params.id, req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    res.json(rows[0]);
  });

  // New Customer form auto-fill: looks up any ID document / proof of
  // address already uploaded on the Finance page under this name (the
  // customer doesn't need to exist yet — Finance's Customer field is
  // free text) and returns whatever got scraped off them.
  app.get('/api/finance/documents-by-customer', requireAuth, async (req, res) => {
    const name = (req.query.customer || '').trim().toLowerCase();
    if (!name) return res.json([]);
    const rows = await db.all(
      `SELECT id, name, type, customer, status,
              extractedName, extractedIdNumber, extractedAddress, extractedPhone
       FROM finance_documents
       WHERE status = 'extracted'
         AND type IN ('id_document', 'proof_of_address')
         AND LOWER(TRIM(customer)) = ?
         AND ownerId = ?`,
      [name, req.userId]
    );
    res.json(rows);
  });

  app.delete('/api/finance/documents/:id', requireAuth, async (req, res) => {
    try {
      const docRows = await db.all('SELECT id FROM finance_documents WHERE id = ? AND ownerId = ?', [req.params.id, req.userId]);
      if (!docRows.length) return res.status(404).json({ error: 'Document not found.' });
      await db.tx(async (t) => {
        await t.run('DELETE FROM finance_transactions WHERE documentId = ?', [req.params.id]);
        await t.run('DELETE FROM finance_documents WHERE id = ?', [req.params.id]);
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to delete finance document:', err);
      res.status(500).json({ error: 'Failed to delete document.' });
    }
  });

  app.patch('/api/finance/transactions/:id', requireAuth, async (req, res) => {
    const { category } = req.body || {};
    if (!category) return res.status(400).json({ error: 'category is required.' });
    try {
      // Confirm this transaction's parent document belongs to this
      // account before letting the update through.
      const owned = await db.all(
        `SELECT t.id FROM finance_transactions t
         JOIN finance_documents d ON d.id = t.documentId
         WHERE t.id = ? AND d.ownerId = ?`,
        [req.params.id, req.userId]
      );
      if (!owned.length) return res.status(404).json({ error: 'Transaction not found.' });
      await db.run('UPDATE finance_transactions SET category = ? WHERE id = ?', [category, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to update transaction category:', err);
      res.status(500).json({ error: 'Failed to update category.' });
    }
  });

  async function processFinanceDocument(id) {
    await db.run("UPDATE finance_documents SET status = 'extracting' WHERE id = ?", [id]);

    try {
      const rows = await db.all('SELECT * FROM finance_documents WHERE id = ?', [id]);
      const doc = rows[0];
      if (!doc) return;

      // Bank statements produce transactions; ID documents and proof of
      // address get OCR'd and heuristically parsed for a name/ID
      // number/address the New Customer form can auto-fill from.
      if (doc.type === 'bank_statement') {
        const buffer = Buffer.from(doc.fileData, 'base64');
        const { text } = await lib('financeOcr').extractTextFromPdf(buffer);
        const transactions = lib('financeParse').parseTransactionsFromText(text);

        await db.tx(async (t) => {
          for (const txn of transactions) {
            const txnId = 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            await t.run(
              `INSERT INTO finance_transactions (id, documentId, date, description, amount, category)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [txnId, id, txn.date, txn.description, txn.amount, lib('financeCategorize').categorizeTransaction(txn.description)]
            );
          }
        });
      } else if (doc.type === 'id_document' || doc.type === 'proof_of_address') {
        const buffer = Buffer.from(doc.fileData, 'base64');
        const { text } = await lib('identityOcr').extractTextFromDocument(buffer, doc.mimeType);
        const parsed = lib('identityParse').parseIdentityDocument(text, doc.type);
        await db.run(
          `UPDATE finance_documents SET extractedName = ?, extractedIdNumber = ?, extractedAddress = ?, extractedPhone = ? WHERE id = ?`,
          [parsed.name || '', parsed.idNumber || '', parsed.address || '', parsed.phone || '', id]
        );
      }

      await db.run("UPDATE finance_documents SET status = 'extracted' WHERE id = ?", [id]);
    } catch (err) {
      console.error(`Failed to process finance document ${id}:`, err);
      await db.run(
        "UPDATE finance_documents SET status = 'failed', errorMessage = ? WHERE id = ?",
        [String(err.message || err), id]
      );
    }
  }

  app.get('/api/finance/summary/:customer', requireAuth, async (req, res) => {
    const customer = req.params.customer;
    try {
      const categories = await db.all(
        `SELECT t.category as category, SUM(ABS(t.amount)) as total, COUNT(*) as count
         FROM finance_transactions t
         JOIN finance_documents d ON d.id = t.documentId
         WHERE d.customer = ? AND d.ownerId = ?
         GROUP BY t.category
         ORDER BY total DESC`,
        [customer, req.userId]
      );
      const documents = await db.all(
        `SELECT id, name, type, status, uploadedAt FROM finance_documents WHERE customer = ? AND ownerId = ? ORDER BY uploadedAt DESC`,
        [customer, req.userId]
      );
      res.json({ categories, documents });
    } catch (err) {
      console.error('Failed to build finance summary:', err);
      res.status(500).json({ error: 'Failed to load finance summary.' });
    }
  });

  // ---------- prefs API ----------
  app.get('/api/prefs', requireAuth, async (req, res) => {
    const rows = await db.all('SELECT data FROM prefs WHERE ownerId = ?', [req.userId]);
    if (rows.length) return res.json(JSON.parse(rows[0].data));
    // First run: seed from env so the business name / interest rate show up.
    const seed = {};
    if (process.env.BUSINESS_NAME) seed.businessName = process.env.BUSINESS_NAME;
    if (process.env.DEFAULT_INTEREST_RATE) seed.preferredInterestRate = Number(process.env.DEFAULT_INTEREST_RATE);
    res.json(Object.keys(seed).length ? seed : null);
  });

  app.put('/api/prefs', requireAuth, async (req, res) => {
    try {
      // DELETE+INSERT (rather than an id=1 upsert) since prefs is now
      // keyed by ownerId, one row per account, not a single shared row.
      await db.tx(async (t) => {
        await t.run('DELETE FROM prefs WHERE ownerId = ?', [req.userId]);
        await t.run('INSERT INTO prefs (ownerId, data) VALUES (?, ?)', [req.userId, JSON.stringify(req.body || {})]);
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to save prefs:', err);
      res.status(500).json({ error: 'Failed to save preferences.' });
    }
  });

  // ---------- loan notification email ----------
  // Configure via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  // SMTP_FROM (optional), and a default recipient BUSINESS_EMAIL (optional
  // — the app can also send its own "to" address from Settings).
  let mailer = null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
    } catch (e) {
      console.error('nodemailer not available — run npm install. Loan notification emails are disabled.', e);
    }
  }

  app.post('/api/notify-loan', async (req, res) => {
    const to = (req.body && req.body.to) || process.env.BUSINESS_EMAIL;
    const loan = req.body && req.body.loan;
    if (!to) return res.status(400).json({ ok: false, error: 'No recipient email configured. Set one in Settings, or set BUSINESS_EMAIL on the server.' });
    if (!loan) return res.status(400).json({ ok: false, error: 'Missing loan details.' });
    if (!mailer) return res.status(503).json({ ok: false, error: 'Email is not configured on this server (SMTP_HOST/SMTP_USER/SMTP_PASS).' });

    const subject = `New loan — ${loan.customer} — R${loan.principal} (review & confirm)`;
    const text =
`A new loan was just added to TrackLend.

Customer name: ${loan.customer}
Amount borrowed: R${loan.principal}
Interest amount: R${loan.interest}
Total due: R${loan.totalDue}
Date issued: ${loan.date}
Repayment date: ${loan.repaymentDate || '—'}

Removal password: ${loan.password}
(Keep this safe — it's required to delete this loan from TrackLend later.)`;

    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        priority: 'high',
        headers: {
          'X-Priority': '1',
          'X-MSMail-Priority': 'High',
          'Importance': 'high'
        }
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to send loan notification email:', err);
      res.status(500).json({ ok: false, error: 'Failed to send email.' });
    }
  });

  app.post('/api/notify', async (req, res) => {
    const to = req.body && req.body.to;
    const subject = req.body && req.body.subject;
    const text = req.body && req.body.text;
    if (!to) return res.status(400).json({ ok: false, error: 'No recipient email configured. Set one in Settings.' });
    if (!subject || !text) return res.status(400).json({ ok: false, error: 'Missing subject or message.' });
    if (!mailer) return res.status(503).json({ ok: false, error: 'Email is not configured on this server (SMTP_HOST/SMTP_USER/SMTP_PASS).' });

    try {
      await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed to send notification email:', err);
      res.status(500).json({ ok: false, error: 'Failed to send email.' });
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TrackLend running at http://localhost:${PORT}`);
  });
})();

ready.catch(err => { console.error('Failed to start:', err); process.exit(1); });
