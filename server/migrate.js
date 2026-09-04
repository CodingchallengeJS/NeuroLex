#!/usr/bin/env node
/**
 * Applies every .sql file in migrations/ that has not run yet, in filename
 * order, each inside its own transaction. Already-applied files are recorded in
 * schema_migrations and skipped.
 *
 * Safe to run on every boot: on an up-to-date database it does nothing.
 * Unlike createdb.sql it never drops anything.
 */
const fs = require('fs');
const path = require('path');
const { createPool, describeTarget } = require('./db');

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedVersions(client) {
  const res = await client.query('SELECT version FROM schema_migrations');
  return new Set(res.rows.map((r) => r.version));
}

function pendingFiles(applied) {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f));
}

async function main() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    console.log(`Migrating ${describeTarget()}`);
    await ensureMigrationsTable(client);
    const pending = pendingFiles(await appliedVersions(client));

    if (pending.length === 0) {
      console.log('Database already up to date, nothing to apply.');
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      process.stdout.write(`  applying ${file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log('ok');
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('failed');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration error:', err.message);
  process.exit(1);
});
