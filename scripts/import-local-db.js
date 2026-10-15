// One-time import of your desktop loans.db into Turso.
//   node scripts/import-local-db.js "C:\path\to\loans.db"
// Needs TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in .env (or the environment).
// Desktop file location: %APPDATA%\TrackLend\loans.db
//
// Copies loans, expenses, customer profiles, finance documents/transactions
// and settings, re-labelling every row to the single site owner. Safe to
// re-run: existing rows with the same id are replaced.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const initSqlJs = require('sql.js');
const { createClient } = require('@libsql/client');

const OWNER = 'owner';
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Usage: node scripts/import-local-db.js <path to loans.db>'); process.exit(1); }

(async () => {
  const SQL = await initSqlJs();
  const src = new SQL.Database(fs.readFileSync(file));
  const rows = (sql) => { const st = src.prepare(sql); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
  const hasTable = (t) => rows(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length > 0;

  // Make sure the target schema exists by starting the app's DB setup once.
  process.env.PORT = '0';
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:' + path.join(__dirname, '..', 'local.db'),
    authToken: process.env.TURSO_AUTH_TOKEN
  });
  const src_server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const schema = src_server.match(/const SCHEMA = `([\s\S]*?)`;/)[1];
  for (const s of schema.split(';').map(x => x.trim()).filter(Boolean)) await client.execute(s);
  const cols = async (t) => (await client.execute(`PRAGMA table_info(${t})`)).rows.map(r => r[1]);
  for (const t of ['loans','customer_profiles','finance_documents','expenses','prefs']) {
    if (!(await cols(t)).includes('ownerId')) await client.execute(`ALTER TABLE ${t} ADD COLUMN ownerId TEXT`);
  }

  async function copy(table, keyCols, { owner = true } = {}) {
    if (!hasTable(table)) return console.log(`- ${table}: not in source, skipped`);
    const data = rows(`SELECT * FROM ${table}`);
    const dest = await cols(table);
    let n = 0;
    for (const r of data) {
      if (owner) r.ownerId = OWNER;
      const names = Object.keys(r).filter(c => dest.includes(c));
      const del = keyCols.map(k => `${k} = ?`).join(' AND ');
      await client.execute({ sql: `DELETE FROM ${table} WHERE ${del}`, args: keyCols.map(k => r[k]) });
      await client.execute({
        sql: `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
        args: names.map(c => r[c] === undefined ? null : r[c])
      });
      n++;
    }
    console.log(`- ${table}: ${n} rows`);
  }

  console.log('Importing into', process.env.TURSO_DATABASE_URL ? 'Turso' : 'local.db');
  await copy('loans', ['id']);
  await copy('expenses', ['id']);
  await copy('customer_profiles', ['customer']);
  await copy('finance_documents', ['id']);
  await copy('finance_transactions', ['id'], { owner: false });

  // Settings: DB may hold several accounts' prefs — import the one with the most data
  // (or pass an account email as argv[3] to pick a specific one).
  if (hasTable('prefs')) {
    const all = rows('SELECT * FROM prefs');
    let pick = all;
    const email = process.argv[3];
    if (email && hasTable('app_users')) {
      const u = rows(`SELECT id FROM app_users WHERE email = '${email.replace(/'/g, '')}'`)[0];
      if (u) pick = all.filter(p => p.ownerId === u.id);
    }
    pick.sort((a, b) => String(b.data).length - String(a.data).length);
    if (pick.length) {
      const prefs = JSON.parse(pick[0].data);
      // businessName / interest rate used to live on the account row
      if (hasTable('app_users')) {
        const acc = rows('SELECT * FROM app_users').find(a => a.id === pick[0].ownerId);
        if (acc) {
          if (!prefs.businessName && acc.businessName) prefs.businessName = acc.businessName;
          if (prefs.preferredInterestRate == null && acc.preferredInterestRate != null) prefs.preferredInterestRate = acc.preferredInterestRate;
          if (!prefs.cardholderName && acc.fullName) prefs.cardholderName = acc.fullName;
        }
      }
      await client.execute({ sql: 'DELETE FROM prefs WHERE ownerId = ?', args: [OWNER] });
      await client.execute({ sql: 'INSERT INTO prefs (ownerId, data) VALUES (?, ?)', args: [OWNER, JSON.stringify(prefs)] });
      console.log('- prefs: imported');
    }
  }
  console.log('Done.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
