const path = require('path');
const { Pool, Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Managed Postgres (Render, Railway, Neon, …) hands you a single DATABASE_URL.
// Local development uses the five separate DB_* variables. Support both.
function sslOption() {
  const mode = String(process.env.DB_SSL || '').toLowerCase();
  if (mode === 'true' || mode === 'require') return { rejectUnauthorized: false };
  if (mode === 'false' || mode === 'disable') return false;

  // Auto: managed providers require SSL, a local/compose database does not.
  if (process.env.DATABASE_URL) {
    return /@(localhost|127\.0\.0\.1|db)[:/]/.test(process.env.DATABASE_URL)
      ? false
      : { rejectUnauthorized: false };
  }
  return false;
}

function poolConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl: sslOption() };
  }

  const missing = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']
    .filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing database settings: ${missing.join(', ')}. ` +
      'Set DATABASE_URL, or all five DB_* variables in server/.env.'
    );
  }

  return {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: sslOption()
  };
}

// Neon's pooled endpoint (pgbouncer) hands out connections with an EMPTY
// search_path, so unqualified table names resolve to nothing and every query
// looks like "relation does not exist" even though the tables are right there
// in public. Its direct endpoint is unaffected, which is what makes it
// confusing: `\dt` shows nothing while `\dt public.*` lists everything.
//
// It has to be a SET after connecting, not `options=-c search_path=public` in
// the URL - the pooler rejects that outright:
//   ERROR: unsupported startup parameter in options: search_path
//
// Harmless everywhere else: on Render and local Postgres this just restates
// what the default already resolves to, so one code path covers all three.
const SEARCH_PATH = process.env.DB_SEARCH_PATH || 'public';

/**
 * Applies the search_path as part of connecting, so a connection is never
 * handed out before it is set.
 *
 * Doing this on the pool's 'connect' event instead would race with the caller's
 * first query on the same client - node-postgres warns about exactly that
 * ("Calling client.query() when the client is already executing a query is
 * deprecated") and will reject it outright in pg@9.
 */
class SearchPathClient extends Client {
  connect(callback) {
    const applyPath = () => super.query(`SET search_path TO ${SEARCH_PATH}`);

    if (callback) {
      return super.connect((err) => {
        if (err) return callback(err);
        applyPath().then(() => callback()).catch(callback);
      });
    }
    return super.connect().then(applyPath).then(() => undefined);
  }
}

function createPool(extra = {}) {
  return new Pool({ Client: SearchPathClient, ...poolConfig(), ...extra });
}

// Where the database lives, without ever printing the password.
function describeTarget() {
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    } catch {
      return 'DATABASE_URL';
    }
  }
  return `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
}

module.exports = { createPool, poolConfig, describeTarget };
