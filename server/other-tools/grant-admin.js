/**
 * Grants or revokes the maintainer flag that lets an account edit global
 * vocabulary (PUT /api/vocabs/:id).
 *
 *   node other-tools/grant-admin.js you@example.com          # grant
 *   node other-tools/grant-admin.js you@example.com --revoke # revoke
 *   node other-tools/grant-admin.js --list                   # who has it
 *
 * ADMIN_EMAIL in the environment covers the common case by granting the flag
 * at registration time. This script is for accounts that already exist - for
 * instance if you registered on the deployed site before setting ADMIN_EMAIL.
 */
const { createPool, describeTarget } = require('../db');

const pool = createPool();

async function list(client) {
  const r = await client.query(
    'SELECT id, username, email FROM users WHERE is_admin = TRUE ORDER BY id'
  );
  if (r.rowCount === 0) {
    console.log('No account currently has the maintainer flag.');
    return;
  }
  console.log(`${r.rowCount} account(s) with the maintainer flag:`);
  r.rows.forEach((u) => console.log(`  id=${u.id}  ${u.username}  <${u.email}>`));
}

async function setFlag(client, email, value) {
  const r = await client.query(
    'UPDATE users SET is_admin = $1 WHERE LOWER(email) = LOWER($2) RETURNING id, username, email',
    [value, email]
  );
  if (r.rowCount === 0) {
    throw new Error(`No user found with email ${email}`);
  }
  const u = r.rows[0];
  console.log(
    `${value ? 'Granted' : 'Revoked'} maintainer rights ${value ? 'to' : 'from'} ` +
    `id=${u.id} ${u.username} <${u.email}>`
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node other-tools/grant-admin.js <email> [--revoke]');
    console.log('       node other-tools/grant-admin.js --list');
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    console.log(`Database: ${describeTarget()}\n`);
    if (args.includes('--list')) {
      await list(client);
      return;
    }
    const email = args.find((a) => !a.startsWith('--'));
    if (!email) throw new Error('An email address is required');
    await setFlag(client, email, !args.includes('--revoke'));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
