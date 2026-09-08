/**
 * Merges one user's spaced-repetition progress from the LOCAL database into a
 * deployed one (Render by default).
 *
 *   node other-tools/sync-user-progress.js <localUserId> <remoteUserId>
 *   node other-tools/sync-user-progress.js 1 1 --apply
 *   node other-tools/sync-user-progress.js 1 1 --target=neon --apply
 *
 * Without --apply it only reports what it would do. Nothing is written.
 *
 * MERGE RULE (for a word both sides already know):
 *   repetition_level -> the HIGHER of the two   (keep the better memory)
 *   next_review_at   -> the LATER of the two    (keep the longer earned gap)
 * Both are taken independently, as asked. The remaining columns follow:
 * interval_days comes from whichever side supplied the winning level, streaks
 * and review counts take the max, last_reviewed_at the most recent, created_at
 * the earliest, and mastered is recomputed from the winning level so it cannot
 * disagree with it.
 *
 * WHY IT MATCHES ON THE WORD, NOT vocab_id
 * The two databases were seeded independently, so their ids disagree: measured
 * on this pair, only 348 of 2944 ids point at the same word. Copying vocab_id
 * across would silently attach your progress to unrelated words. vocabulary.word
 * is the natural key here (the same rule export-sync.js follows), and it is
 * unique on both sides.
 *
 * The merge itself runs inside one transaction on the target, in SQL, with
 * GREATEST/LEAST against the live row - so it is atomic, and re-running it
 * changes nothing.
 */
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};
const positional = args.filter((a) => !a.startsWith('--'));

const TARGET_NAME = (flag('target') || 'render').toLowerCase();

function usage(message) {
  console.error(`
${message}

  node other-tools/sync-user-progress.js <localUserId> <remoteUserId> [--apply] [--target=render|neon]

  localUserId   the user in your LOCAL database (source)
  remoteUserId  the user in the deployed database (destination)
  --apply       actually write; without it you get a preview only
  --target=     render (default, RENDER_DATABASE_URL) or neon (DATABASE_URL_UNPOOLED)
`);
  process.exit(1);
}

const localUserId = Number(positional[0]);
const remoteUserId = Number(positional[1]);
if (!Number.isInteger(localUserId) || !Number.isInteger(remoteUserId)) {
  usage('Two user ids are required.');
}

/* ------------------------------------------------------------------ *
 * Connections
 * ------------------------------------------------------------------ */

// A URL with no explicit port inherits PGPORT, and this project sets PGPORT=5433
// for the local server - which silently sends a cloud connection to the wrong
// port and fails with a bare timeout. Pin it.
function normalise(raw, label) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid connection URL`);
  }
  if (!u.port) u.port = '5432';
  return u;
}

// The local side is built from the DB_* variables ON PURPOSE. DATABASE_URL in
// this project's .env points at the deployed copy, so falling back to it would
// quietly make "local" mean something else entirely.
function localPool() {
  const missing = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
    .filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `The local database is read from ${missing.join(', ')} in server/.env, which are not set. ` +
      'This tool deliberately does not fall back to DATABASE_URL, because that points at the deployed database.'
    );
  }
  return {
    pool: new Pool({
      host: process.env.DB_HOST,
      port: Number.parseInt(process.env.DB_PORT, 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: false
    }),
    label: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
  };
}

function remotePool() {
  const sources = {
    render: ['RENDER_DATABASE_URL'],
    // The pooled endpoint is fine for queries, but the direct one is the right
    // choice for a bulk write.
    neon: ['DATABASE_URL_UNPOOLED', 'DATABASE_URL']
  };
  const keys = sources[TARGET_NAME];
  if (!keys) usage(`Unknown --target=${TARGET_NAME}`);

  const key = keys.find((k) => process.env[k]);
  if (!key) {
    throw new Error(`Set ${keys.join(' or ')} in server/.env to sync to ${TARGET_NAME}.`);
  }
  const u = normalise(process.env[key], key);
  return {
    pool: new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } }),
    // Host and database only - the URL carries a password and is never printed.
    label: `${u.hostname}/${u.pathname.slice(1)}  (${key})`
  };
}

/* ------------------------------------------------------------------ *
 * Merge preview, computed the same way the SQL will
 * ------------------------------------------------------------------ */

const laterOf = (a, b) => (new Date(a) > new Date(b) ? a : b);

// next_review_at is `timestamp without time zone`, i.e. wall-clock with no zone,
// and node-postgres hands it back as a local-time Date. toISOString() would
// convert to UTC and print the previous day for anything before the offset -
// a review due 2026-01-01 00:00 would read as 2025-12-31. Format it as local.
const fmt = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

function mergeRow(local, remote) {
  const level = Math.max(local.repetition_level, remote.repetition_level);
  const next = laterOf(local.next_review_at, remote.next_review_at);
  return {
    repetition_level: level,
    next_review_at: next,
    changed: level !== remote.repetition_level ||
      new Date(next).getTime() !== new Date(remote.next_review_at).getTime()
  };
}

async function main() {
  const src = localPool();
  const dst = remotePool();

  console.log(`source : ${src.label}   user ${localUserId}`);
  console.log(`target : ${dst.label}   user ${remoteUserId}`);
  console.log(APPLY ? 'mode   : APPLY (writes)\n' : 'mode   : preview only (pass --apply to write)\n');

  const srcUser = (await src.pool.query(
    'SELECT id, username, email FROM users WHERE id = $1', [localUserId])).rows[0];
  const dstUser = (await dst.pool.query(
    'SELECT id, username, email FROM users WHERE id = $1', [remoteUserId])).rows[0];

  if (!srcUser) throw new Error(`No user ${localUserId} in the local database.`);
  if (!dstUser) throw new Error(`No user ${remoteUserId} in the ${TARGET_NAME} database.`);

  console.log(`source user: ${srcUser.username} <${srcUser.email}>`);
  console.log(`target user: ${dstUser.username} <${dstUser.email}>`);
  // Usernames differ across deployments; a different EMAIL is the real warning
  // sign that these are two different people.
  if (srcUser.email !== dstUser.email) {
    console.log('\n  !! These two accounts have DIFFERENT email addresses.');
    console.log('     Check the ids before applying - progress would be merged into the wrong person.\n');
  }

  const rows = (await src.pool.query(`
    SELECT v.word, p.repetition_level, p.interval_days, p.next_review_at,
           p.last_reviewed_at, p.correct_streak, p.total_reviews, p.created_at
    FROM user_vocab_progress p
    JOIN vocabulary v ON v.id = p.vocab_id
    WHERE p.user_id = $1
    ORDER BY v.word`, [localUserId])).rows;

  if (rows.length === 0) {
    console.log('\nNothing to sync: that user has no progress locally.');
    return finish(src, dst, 0);
  }

  const targetVocab = (await dst.pool.query('SELECT id, word FROM vocabulary')).rows;
  const idByWord = new Map(targetVocab.map((r) => [r.word.toLowerCase(), r.id]));

  const existing = (await dst.pool.query(`
    SELECT v.word, p.repetition_level, p.next_review_at
    FROM user_vocab_progress p
    JOIN vocabulary v ON v.id = p.vocab_id
    WHERE p.user_id = $1`, [remoteUserId])).rows;
  const remoteByWord = new Map(existing.map((r) => [r.word.toLowerCase(), r]));

  const unmatched = [];
  const inserts = [];
  const merges = [];

  for (const row of rows) {
    const key = row.word.toLowerCase();
    if (!idByWord.has(key)) { unmatched.push(row.word); continue; }
    const remote = remoteByWord.get(key);
    if (!remote) inserts.push(row);
    else merges.push({ word: row.word, local: row, remote, merged: mergeRow(row, remote) });
  }

  console.log(`\nlocal progress rows      : ${rows.length}`);
  console.log(`already on the target    : ${existing.length}`);
  console.log(`  -> new rows to insert  : ${inserts.length}`);
  console.log(`  -> rows to merge       : ${merges.length}`);
  console.log(`  -> of those, unchanged : ${merges.filter((m) => !m.merged.changed).length}`);

  if (unmatched.length > 0) {
    console.log(`\n  ${unmatched.length} word(s) do not exist in the target vocabulary and are SKIPPED:`);
    console.log('   ', unmatched.slice(0, 15).join(', ') + (unmatched.length > 15 ? ', ...' : ''));
    console.log('    (run sync-content.sql against the target first if you expected these)');
  }

  if (merges.length > 0) {
    console.log('\nmerge detail (level / next review):');
    const shown = merges.slice(0, 25);
    for (const m of shown) {
      const mark = m.merged.changed ? '->' : '==';
      console.log(
        `  ${m.word.padEnd(24)} local ${String(m.local.repetition_level).padStart(2)} ${fmt(m.local.next_review_at)}` +
        `   target ${String(m.remote.repetition_level).padStart(2)} ${fmt(m.remote.next_review_at)}` +
        `   ${mark} ${String(m.merged.repetition_level).padStart(2)} ${fmt(m.merged.next_review_at)}`
      );
    }
    if (merges.length > shown.length) console.log(`  ... and ${merges.length - shown.length} more`);
  }

  if (!APPLY) {
    console.log('\nPreview only - nothing was written. Re-run with --apply to commit.');
    return finish(src, dst, 0);
  }

  /* ---------------- write ---------------- */

  const usable = rows.filter((r) => idByWord.has(r.word.toLowerCase()));
  const client = await dst.pool.connect();
  try {
    await client.query('BEGIN');

    // The rows go into a temp table and the merge happens in one statement
    // against the live values, so a review finished on the site mid-sync is
    // merged rather than overwritten.
    await client.query(`
      CREATE TEMP TABLE incoming_progress (
        word TEXT PRIMARY KEY,
        repetition_level INTEGER,
        interval_days INTEGER,
        next_review_at TIMESTAMP,
        last_reviewed_at TIMESTAMP,
        correct_streak INTEGER,
        total_reviews INTEGER,
        created_at TIMESTAMP
      ) ON COMMIT DROP`);

    await client.query(`
      INSERT INTO incoming_progress
        (word, repetition_level, interval_days, next_review_at, last_reviewed_at, correct_streak, total_reviews, created_at)
      SELECT * FROM UNNEST(
        $1::text[], $2::int[], $3::int[], $4::timestamp[], $5::timestamp[], $6::int[], $7::int[], $8::timestamp[])`,
      [
        usable.map((r) => r.word),
        usable.map((r) => r.repetition_level),
        usable.map((r) => r.interval_days),
        usable.map((r) => r.next_review_at),
        usable.map((r) => r.last_reviewed_at),
        usable.map((r) => r.correct_streak),
        usable.map((r) => r.total_reviews),
        usable.map((r) => r.created_at)
      ]
    );

    // GREATEST/LEAST ignore NULLs in Postgres, which is what we want for the
    // nullable columns (last_reviewed_at on a word that was never reviewed).
    const upsert = await client.query(`
      INSERT INTO user_vocab_progress
        (user_id, vocab_id, repetition_level, interval_days, next_review_at,
         last_reviewed_at, correct_streak, total_reviews, mastered, created_at, updated_at)
      SELECT $1, v.id, i.repetition_level, i.interval_days, i.next_review_at,
             i.last_reviewed_at, COALESCE(i.correct_streak, 0), COALESCE(i.total_reviews, 0),
             i.repetition_level >= 4, COALESCE(i.created_at, NOW()), NOW()
      FROM incoming_progress i
      JOIN vocabulary v ON LOWER(v.word) = LOWER(i.word)
      ON CONFLICT (user_id, vocab_id) DO UPDATE SET
        repetition_level = GREATEST(user_vocab_progress.repetition_level, EXCLUDED.repetition_level),
        next_review_at   = GREATEST(user_vocab_progress.next_review_at, EXCLUDED.next_review_at),
        interval_days    = CASE
                             WHEN EXCLUDED.repetition_level >= user_vocab_progress.repetition_level
                             THEN EXCLUDED.interval_days
                             ELSE user_vocab_progress.interval_days
                           END,
        last_reviewed_at = GREATEST(user_vocab_progress.last_reviewed_at, EXCLUDED.last_reviewed_at),
        correct_streak   = GREATEST(user_vocab_progress.correct_streak, EXCLUDED.correct_streak),
        total_reviews    = GREATEST(user_vocab_progress.total_reviews, EXCLUDED.total_reviews),
        mastered         = GREATEST(user_vocab_progress.repetition_level, EXCLUDED.repetition_level) >= 4,
        created_at       = LEAST(user_vocab_progress.created_at, EXCLUDED.created_at),
        updated_at       = NOW()
      RETURNING vocab_id`,
      [remoteUserId]
    );

    await client.query('COMMIT');
    console.log(`\nwrote ${upsert.rowCount} row(s).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  /* ---------------- verify ---------------- */

  console.log('\nverifying...');
  const after = (await dst.pool.query(`
    SELECT v.word, p.repetition_level, p.next_review_at
    FROM user_vocab_progress p
    JOIN vocabulary v ON v.id = p.vocab_id
    WHERE p.user_id = $1`, [remoteUserId])).rows;
  const afterByWord = new Map(after.map((r) => [r.word.toLowerCase(), r]));

  let wrong = 0;
  for (const row of usable) {
    const got = afterByWord.get(row.word.toLowerCase());
    if (!got) { wrong += 1; console.log(`  MISSING ${row.word}`); continue; }
    const was = remoteByWord.get(row.word.toLowerCase());
    const wantLevel = was ? Math.max(row.repetition_level, was.repetition_level) : row.repetition_level;
    const wantNext = was ? laterOf(row.next_review_at, was.next_review_at) : row.next_review_at;
    const okLevel = got.repetition_level === wantLevel;
    const okNext = new Date(got.next_review_at).getTime() === new Date(wantNext).getTime();
    if (!okLevel || !okNext) {
      wrong += 1;
      if (wrong <= 10) {
        console.log(`  BAD ${row.word}: level ${got.repetition_level} (want ${wantLevel}), ` +
          `next ${fmt(got.next_review_at)} (want ${fmt(wantNext)})`);
      }
    }
  }

  console.log(`target user ${remoteUserId} now has ${after.length} progress rows ` +
    `(was ${existing.length}).`);
  if (wrong === 0) {
    console.log(`\nOK  all ${usable.length} synced word(s) hold the merged level and review date.`);
  } else {
    console.log(`\n${wrong} row(s) did not end up as expected.`);
  }
  return finish(src, dst, wrong === 0 ? 0 : 1);
}

async function finish(src, dst, code) {
  await src.pool.end();
  await dst.pool.end();
  process.exit(code);
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
