/**
 * Copies one Postgres database into another with pg_dump | psql.
 *
 *   SOURCE_DATABASE_URL='postgresql://...' node other-tools/copy-database.js
 *   SOURCE_DATABASE_URL='...' node other-tools/copy-database.js --dry-run
 *   SOURCE_DATABASE_URL='...' node other-tools/copy-database.js --force
 *
 * Source  : SOURCE_DATABASE_URL (required) - e.g. the Render connection string.
 * Target  : TARGET_DATABASE_URL, else DATABASE_URL from ../../.env.local
 *           (which `neon link` writes), else DATABASE_URL from the environment.
 *
 * Neither URL is ever printed; only host/database are shown.
 *
 * Refuses to write into a target that already has tables unless --force, so a
 * mistyped target cannot quietly overwrite something.
 *
 * Afterwards it compares row counts table by table and reports any mismatch,
 * because "the command exited 0" is not the same as "the data arrived".
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

function readEnvFile(file, key) {
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, 'utf8').match(new RegExp('^' + key + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

/**
 * A URL without an explicit port inherits PGPORT, and this project sets
 * PGPORT=5433 for local Postgres - which silently sends a cloud connection to
 * the wrong port and fails with a bare timeout. Pin the port explicitly.
 */
function normalise(rawUrl, label) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`${label} is not a valid connection URL`);
  }
  if (!u.port) u.port = '5432';
  return u;
}

const sourceRaw = process.env.SOURCE_DATABASE_URL;
if (!sourceRaw) {
  console.error(`
Set SOURCE_DATABASE_URL to the database you want to copy FROM.

  SOURCE_DATABASE_URL='postgresql://user:pass@host/db' node other-tools/copy-database.js

Use the EXTERNAL connection string from the Render dashboard
(Dashboard -> your Postgres -> Connections -> External Database URL).
The internal one only resolves from inside Render's network.
`);
  process.exit(1);
}

const targetRaw =
  process.env.TARGET_DATABASE_URL ||
  readEnvFile(path.resolve(__dirname, '../../.env.local'), 'DATABASE_URL') ||
  process.env.DATABASE_URL;

if (!targetRaw) {
  console.error('No target found. Set TARGET_DATABASE_URL, or run `neon link` to create .env.local.');
  process.exit(1);
}

const source = normalise(sourceRaw, 'SOURCE_DATABASE_URL');
const target = normalise(targetRaw, 'target URL');

const describe = (u) => `${u.hostname}:${u.port}/${u.pathname.slice(1)}`;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

// PGPORT/PGHOST etc. in the environment override parts of a URL. Strip them so
// the child processes see exactly what we pass.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const k of ['PGPORT', 'PGHOST', 'PGUSER', 'PGDATABASE', 'PGPASSWORD']) delete env[k];
  return env;
}

function psqlScalar(url, sql) {
  const r = spawnSync('psql', [url.toString(), '-At', '-c', sql], {
    encoding: 'utf8', env: cleanEnv(), timeout: 120000
  });
  if (r.status !== 0) throw new Error((r.stderr || 'psql failed').trim().split('\n')[0]);
  return r.stdout.trim();
}

function tableCounts(url) {
  const sql = `
    SELECT string_agg(t.table_name || '=' || (
      xpath('/row/c/text()',
        query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.table_name), false, true, ''))
      )[1]::text, E'\\n' ORDER BY t.table_name)
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'`;
  const out = psqlScalar(url, sql);
  const counts = new Map();
  for (const line of out.split('\n').filter(Boolean)) {
    const i = line.lastIndexOf('=');
    counts.set(line.slice(0, i), Number(line.slice(i + 1)));
  }
  return counts;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

console.log(`Source : ${describe(source)}`);
console.log(`Target : ${describe(target)}\n`);

let sourceCounts;
try {
  console.log('Source version :', psqlScalar(source, 'SELECT split_part(version(), \',\', 1)'));
  sourceCounts = tableCounts(source);
} catch (e) {
  console.error('Cannot read the source:', e.message);
  process.exit(1);
}

let targetCounts;
try {
  console.log('Target version :', psqlScalar(target, 'SELECT split_part(version(), \',\', 1)'));
  targetCounts = tableCounts(target);
} catch (e) {
  console.error('Cannot read the target:', e.message);
  process.exit(1);
}

const sourceRows = [...sourceCounts.values()].reduce((a, b) => a + b, 0);
console.log(`\nSource has ${sourceCounts.size} tables, ${sourceRows} rows total:`);
for (const [t, c] of sourceCounts) console.log(`  ${t.padEnd(26)} ${c}`);

if (targetCounts.size > 0) {
  console.log(`\nTarget already has ${targetCounts.size} table(s).`);
  if (!FORCE && !DRY_RUN) {
    console.error('\nRefusing to overwrite. Re-run with --force if that is what you want.');
    process.exit(1);
  }
}

// Password hashes travel with the rows, but the secret needed to verify them
// does not live in the database. Copying users without also copying AUTH_PEPPER
// leaves every account unable to log in, with a bare 401 and no clue why.
if ((sourceCounts.get('users') || 0) > 0) {
  console.log([
    '',
    'NOTE  The source has ' + sourceCounts.get('users') + ' user account(s).',
    '',
    '      Passwords are hashed as bcrypt(password + AUTH_PEPPER), and',
    '      AUTH_PEPPER is NOT stored in the database. Whatever environment',
    '      serves this copy must use the SAME AUTH_PEPPER as the source, or',
    '      every login fails with 401 even though the password is correct.',
    '',
    '      Copy JWT_SECRET too, or tokens already issued stop verifying.',
    '',
    '      On Render both are generated (render.yaml uses generateValue: true),',
    '      so read the real values from: Dashboard -> service -> Environment.'
  ].join('\n'));
}

if (DRY_RUN) {
  console.log('\n--dry-run: nothing was written.');
  process.exit(0);
}

const dumpFile = path.resolve(__dirname, '../../.tmp-db-copy.sql');
console.log('\nDumping source...');
const dump = spawnSync('pg_dump', [
  source.toString(),
  '--no-owner',        // roles differ between providers
  '--no-acl',          // ditto for grants
  '--no-comments',
  '--clean',
  '--if-exists',
  '--quote-all-identifiers',
  '-f', dumpFile
], { encoding: 'utf8', env: cleanEnv(), timeout: 900000 });

if (dump.status !== 0) {
  console.error('pg_dump failed:\n' + (dump.stderr || '').trim());
  process.exit(1);
}
console.log(`  wrote ${Math.round(fs.statSync(dumpFile).size / 1024)} KB`);

console.log('Restoring into target...');
const restore = spawnSync('psql', [
  target.toString(),
  '-v', 'ON_ERROR_STOP=1',
  '--single-transaction',
  '-f', dumpFile
], { encoding: 'utf8', env: cleanEnv({ PGCLIENTENCODING: 'UTF8' }), timeout: 900000 });

if (restore.status !== 0) {
  console.error('psql restore failed:\n' + (restore.stderr || '').trim().split('\n').slice(0, 12).join('\n'));
  console.error(`\nThe dump is still at ${dumpFile} if you want to inspect it.`);
  process.exit(1);
}

fs.unlinkSync(dumpFile);

/* ------------------------------------------------------------------ *
 * Verify
 * ------------------------------------------------------------------ */

console.log('\nVerifying row counts...');
const after = tableCounts(target);
let mismatches = 0;
for (const [t, expected] of sourceCounts) {
  const got = after.has(t) ? after.get(t) : null;
  const ok = got === expected;
  if (!ok) mismatches += 1;
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${t.padEnd(26)} source ${expected} -> target ${got === null ? 'MISSING' : got}`);
}

const missingOnSource = [...after.keys()].filter((t) => !sourceCounts.has(t));
if (missingOnSource.length) {
  console.log(`  note: target has extra tables not in source: ${missingOnSource.join(', ')}`);
}

if (mismatches === 0) {
  console.log(`\n✅ Copied ${sourceCounts.size} tables, ${sourceRows} rows. Every table matches.`);
} else {
  console.error(`\n❌ ${mismatches} table(s) do not match. The copy is incomplete.`);
  process.exit(1);
}
