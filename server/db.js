const path = require('path');
const { Pool } = require('pg');

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

function createPool(extra = {}) {
  return new Pool({ ...poolConfig(), ...extra });
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
