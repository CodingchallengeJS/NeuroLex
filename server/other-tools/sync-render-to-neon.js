/**
 * Replaces the Neon database with a full copy of the Render one.
 *
 *   node other-tools/sync-render-to-neon.js            # preview, writes nothing
 *   node other-tools/sync-render-to-neon.js --apply    # really do it
 *
 * Neon is treated as a disposable mirror here: everything it holds is dropped
 * and replaced. Nothing is ever copied in the other direction.
 *
 * Both URLs come from server/.env - RENDER_DATABASE_URL and, for the target,
 * DATABASE_URL_UNPOOLED (falling back to DATABASE_URL). Neither is printed.
 *
 * The actual work is done by copy-database.js, which already handles the parts
 * that are easy to get wrong: stripping PG* environment variables that would
 * override the URLs, pinning the port (PGPORT=5433 in this project silently
 * redirects any portless cloud URL), --no-owner/--no-acl because roles differ
 * between providers, and a row count comparison per table afterwards.
 */
const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

const source = process.env.RENDER_DATABASE_URL;
if (!source) {
  console.error('Set RENDER_DATABASE_URL in server/.env (the External Database URL from the Render dashboard).');
  process.exit(1);
}

let target = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!target) {
  console.error('Set DATABASE_URL_UNPOOLED (or DATABASE_URL) in server/.env to the Neon database.');
  process.exit(1);
}

// A restore has to go to the DIRECT endpoint. pg_dump's output does things
// pgbouncer will not carry across a pooled connection, and the pooled endpoint
// is where the empty-search_path problem lives. Neon's direct host is the
// pooled one without the "-pooler" suffix.
let note = '';
if (/-pooler\./.test(target)) {
  const direct = target.replace('-pooler.', '.');
  note = 'target was the pooled endpoint; using the direct one instead (-pooler stripped)';
  target = direct;
}

const describe = (raw) => {
  try {
    const u = new URL(raw);
    return `${u.hostname}/${u.pathname.slice(1)}`;
  } catch {
    return '(unparseable URL)';
  }
};

console.log(`source : ${describe(source)}   (Render)`);
console.log(`target : ${describe(target)}   (Neon)`);
if (note) console.log(`note   : ${note}`);
console.log(APPLY
  ? '\nmode   : APPLY - the Neon database will be DROPPED AND REPLACED\n'
  : '\nmode   : preview only (pass --apply to actually replace Neon)\n');

const child = spawnSync(
  process.execPath,
  [
    path.resolve(__dirname, 'copy-database.js'),
    // --force: the target is expected to be non-empty; replacing it is the point.
    ...(APPLY ? ['--force'] : ['--dry-run'])
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, SOURCE_DATABASE_URL: source, TARGET_DATABASE_URL: target }
  }
);

if (child.status === 0 && APPLY) {
  console.log(`
Done. Two things worth remembering about this copy:

  - pg_dump writes "SET search_path = ''" into the dump, so unqualified table
    names will not resolve on a plain connection. The app already handles this
    (server/db.js sets search_path on every new connection); psql needs
    "SET search_path TO public" or \\dt public.*
  - Password hashes came across, but AUTH_PEPPER did not - it is not in the
    database. Whatever serves this copy needs the SAME AUTH_PEPPER and
    JWT_SECRET as Render, or every login fails with a 401.`);
}

if (!APPLY && child.status === 0) {
  console.log('\nPreview only - Neon was not touched. Re-run with --apply to replace it.');
}

process.exit(child.status === null ? 1 : child.status);
