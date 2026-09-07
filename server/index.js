const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { createPool } = require('./db');

const app = express();

// Database settings are validated by db.js, which accepts either DATABASE_URL
// (managed Postgres) or the five DB_* variables (local development).
const requiredEnvVars = [
  'AUTH_PEPPER',
  'BCRYPT_ROUNDS',
  'JWT_SECRET',
  'JWT_EXPIRES_IN'
];

const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  throw new Error(`Missing required env vars: ${missingVars.join(', ')}`);
}

const bcryptRounds = Number.parseInt(process.env.BCRYPT_ROUNDS, 10);
if (!Number.isInteger(bcryptRounds) || bcryptRounds < 8) {
  throw new Error('BCRYPT_ROUNDS must be an integer >= 8');
}

const pool = createPool();

// In the Docker/Render image the client is built into client/dist and served
// from this same origin, so the browser calls /api on its own host and no
// cross-origin request happens. CLIENT_ORIGIN narrows CORS when the frontend is
// served separately (e.g. `npm run dev` on :5173).
app.use(cors(process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN } : {}));
app.use(express.json());

// Behind Render's proxy the client IP arrives in X-Forwarded-For. Trust exactly
// one hop so the rate limiter keys on the real caller and not the proxy.
if (process.env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', 1);
}

// Login and registration are the only unauthenticated write endpoints, so they
// are what a credential-stuffing run would hammer.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number.parseInt(process.env.AUTH_RATE_LIMIT || '20', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần thử, vui lòng đợi ít phút rồi thử lại.' }
});

const vocabularySelectFields = `
  v.id, v.word, v.meaning, v.phonetic, v.example, v.image_url,
  v.english_meaning, v.vietnamese_meaning, v.synonyms,
  COALESCE((
    SELECT JSON_AGG(JSONB_BUILD_OBJECT('slug', t.slug, 'label', t.label, 'kind', t.kind)
                    ORDER BY t.kind, t.label)
    FROM vocab_tags vt JOIN tags t ON t.id = vt.tag_id
    WHERE vt.vocab_id = v.id
  ), '[]') AS tags
`;

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function pepperPassword(password) {
  return `${password}${process.env.AUTH_PEPPER}`;
}

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

// Resolves the caller when a valid token is present, without requiring one.
function optionalUserId(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).sub;
  } catch {
    return null;
  }
}

// Editing global vocabulary is maintainer-only. The flag lives in the database
// rather than the JWT so revoking it takes effect immediately instead of when
// the token expires up to 7 days later.
async function requireAdmin(req, res, next) {
  try {
    const r = await pool.query('SELECT is_admin FROM users WHERE id = $1 LIMIT 1', [req.auth.userId]);
    if (r.rowCount === 0 || r.rows[0].is_admin !== true) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    return next();
  } catch (err) {
    console.error('requireAdmin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function authenticateToken(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = {
      userId: payload.sub,
      email: payload.email
    };
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/* ---------- health + auth ---------- */

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;

  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username, email and password are required' });
  }

  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!validateUsername(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must be 3-30 chars (letters, numbers, underscore)' });
  }

  if (!validateEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8-128 characters' });
  }

  try {
    const existingUsername = await pool.query('SELECT id FROM users WHERE username = $1 LIMIT 1', [normalizedUsername]);
    if (existingUsername.rowCount > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [normalizedEmail]);
    if (existingUser.rowCount > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(pepperPassword(password), bcryptRounds);

    // A brand new deployment has no maintainer yet. Rather than trusting
    // registration order, grant the flag only to the address named in
    // ADMIN_EMAIL. Unset means nobody gets it automatically.
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const isAdmin = adminEmail.length > 0 && adminEmail === normalizedEmail.toLowerCase();

    const insertResult = await pool.query(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING id, username, email, created_at, is_admin',
      [normalizedUsername, normalizedEmail, passwordHash, isAdmin]
    );

    const user = insertResult.rows[0];
    return res.status(201).json({
      message: 'Register success',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        isAdmin: user.is_admin === true
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userResult = await pool.query('SELECT id, username, email, password_hash, created_at, is_admin FROM users WHERE email = $1 LIMIT 1', [
      normalizedEmail
    ]);

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    const passwordMatched = await bcrypt.compare(pepperPassword(password), user.password_hash);

    if (!passwordMatched) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        sub: String(user.id),
        username: user.username,
        email: user.email
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN
      }
    );

    return res.json({
      message: 'Login success',
      accessToken: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        isAdmin: user.is_admin === true
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, username, email, created_at, is_admin FROM users WHERE id = $1 LIMIT 1',
      [req.auth.userId]
    );
    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const user = userResult.rows[0];
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at,
        isAdmin: user.is_admin === true
      }
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------- API endpoints for notebooks/vocab/repetition ---------- */

// ?tag=exam:sat&tag=topic:health -> notebooks carrying ALL of those tags.
// Express gives a string for one value and an array for several.
function tagSlugsFromQuery(raw) {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

app.get('/api/notebooks', async (req, res) => {
  try {
    // owner_user_id IS NULL = built-in notebook from the seed, visible to all.
    // Anything owned is only visible to its owner.
    const userId = optionalUserId(req);
    const tagSlugs = tagSlugsFromQuery(req.query.tag);
    const search = String(req.query.q || '').trim();

    const vals = [userId];
    let filters = '';

    if (tagSlugs.length > 0) {
      vals.push(tagSlugs);
      const tagsParam = '$' + vals.length;
      // Faceted matching: OR within a kind, AND across kinds.
      //
      // Picking SAT + IELTS means "either exam", because nothing is both.
      // Picking IELTS + Magoosh means "IELTS AND from Magoosh", because those
      // describe different axes.
      //
      // Counting DISTINCT kind does both at once: several tags of the same kind
      // still count once, so one match satisfies that kind, while every kind
      // present in the selection has to be matched by something.
      // The `> 0` guard matters: if none of the requested slugs exist, both
      // sides would be 0 and every notebook would match, so a typo would
      // silently return the full list instead of nothing.
      filters += `
        AND (SELECT COUNT(DISTINCT kind) FROM tags WHERE slug = ANY(${tagsParam})) > 0
        AND (
          SELECT COUNT(DISTINCT t2.kind)
          FROM notebook_tags nt2
          JOIN tags t2 ON t2.id = nt2.tag_id
          WHERE nt2.notebook_id = n.id AND t2.slug = ANY(${tagsParam})
        ) = (SELECT COUNT(DISTINCT kind) FROM tags WHERE slug = ANY(${tagsParam}))`;
    }

    if (search) {
      vals.push('%' + search + '%');
      filters += ` AND n.title ILIKE $${vals.length}`;
    }

    const q = `
      SELECT n.*,
        COUNT(DISTINCT nv.vocab_id) AS vocab_count,
        COALESCE(
          JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('slug', t.slug, 'label', t.label, 'kind', t.kind))
            FILTER (WHERE t.id IS NOT NULL),
          '[]'
        ) AS tags
      FROM notebooks n
      LEFT JOIN notebook_vocab nv ON nv.notebook_id = n.id
      LEFT JOIN notebook_tags nt ON nt.notebook_id = n.id
      LEFT JOIN tags t ON t.id = nt.tag_id
      WHERE (n.owner_user_id IS NULL OR n.owner_user_id = $1)${filters}
      GROUP BY n.id
      -- Category first, name second: exam, then source within that exam, then
      -- title. Groups the Cambridge units together, then Magoosh, then the
      -- topic notebooks, then SAT. Untagged ones (Chunk, user lists) sort last.
      ORDER BY
        (SELECT MIN(te.label) FROM notebook_tags nte
           JOIN tags te ON te.id = nte.tag_id
          WHERE nte.notebook_id = n.id AND te.kind = 'exam') ASC NULLS LAST,
        (SELECT MIN(ts.label) FROM notebook_tags nts
           JOIN tags ts ON ts.id = nts.tag_id
          WHERE nts.notebook_id = n.id AND ts.kind = 'source') ASC NULLS LAST,
        n.title ASC
    `;
    const r = await pool.query(q, vals);
    res.json({ notebooks: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------- TAGS ---------- */

app.get('/api/tags', async (req, res) => {
  const scope = req.query.scope ? String(req.query.scope) : null;
  if (scope && !['notebook', 'word', 'both'].includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' });
  }
  try {
    // scope 'both' tags are usable on either, so asking for one includes them.
    const q = `
      SELECT t.*,
        (SELECT COUNT(*) FROM notebook_tags nt WHERE nt.tag_id = t.id)::int AS notebook_count,
        (SELECT COUNT(*) FROM vocab_tags vt WHERE vt.tag_id = t.id)::int AS word_count
      FROM tags t
      WHERE $1::text IS NULL OR t.scope = $1 OR t.scope = 'both'
      ORDER BY t.kind, t.label
    `;
    const r = await pool.query(q, [scope]);
    res.json({ tags: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const TAG_KINDS = ['exam', 'source', 'topic', 'level', 'function', 'register'];
const TAG_SCOPES = ['notebook', 'word', 'both'];

function validateTagBody({ slug, label, kind, scope }, { requireSlug }) {
  if (requireSlug && !slug) return 'Slug is required';
  if (slug && !/^[a-z0-9]+:[a-z0-9-]+$/.test(slug)) {
    return 'Slug must look like kind:name (lowercase, e.g. topic:health)';
  }
  if (!label || !String(label).trim()) return 'Label is required';
  if (!TAG_KINDS.includes(kind)) return 'Kind must be one of: ' + TAG_KINDS.join(', ');
  if (scope && !TAG_SCOPES.includes(scope)) return 'Scope must be one of: ' + TAG_SCOPES.join(', ');
  return null;
}

app.post('/api/tags', authenticateToken, requireAdmin, async (req, res) => {
  const { slug, label, kind, scope, description } = req.body;
  const invalid = validateTagBody(req.body, { requireSlug: true });
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const r = await pool.query(
      `INSERT INTO tags (slug, label, kind, scope, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [slug, String(label).trim(), kind, scope || 'both', description || null]
    );
    res.json({ tag: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'A tag with this slug already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Rename / recategorise. Slug is intentionally immutable: it is what the seed
// importers and saved filters refer to.
app.put('/api/tags/:id', authenticateToken, requireAdmin, async (req, res) => {
  const tagId = Number(req.params.id);
  if (!Number.isInteger(tagId)) return res.status(400).json({ error: 'Invalid tag id' });

  const { label, kind, scope, description } = req.body;
  const invalid = validateTagBody(req.body, { requireSlug: false });
  if (invalid) return res.status(400).json({ error: invalid });

  try {
    const r = await pool.query(
      `UPDATE tags SET label = $1, kind = $2, scope = $3, description = $4
       WHERE id = $5 RETURNING *`,
      [String(label).trim(), kind, scope || 'both', description || null, tagId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json({ tag: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// The join tables are ON DELETE CASCADE, so this drops the tag's links and
// leaves every notebook and word intact.
app.delete('/api/tags/:id', authenticateToken, requireAdmin, async (req, res) => {
  const tagId = Number(req.params.id);
  if (!Number.isInteger(tagId)) return res.status(400).json({ error: 'Invalid tag id' });
  try {
    const r = await pool.query('DELETE FROM tags WHERE id = $1 RETURNING slug', [tagId]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Tag not found' });
    res.json({ deleted: r.rows[0].slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------- WORD TAGS ---------- */

app.get('/api/vocabs/:id/tags', async (req, res) => {
  const vocabId = Number(req.params.id);
  if (!Number.isInteger(vocabId)) return res.status(400).json({ error: 'Invalid vocab id' });
  try {
    const r = await pool.query(
      `SELECT t.* FROM vocab_tags vt JOIN tags t ON t.id = vt.tag_id
       WHERE vt.vocab_id = $1 ORDER BY t.kind, t.label`,
      [vocabId]
    );
    res.json({ tags: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Replace one word's tag set.
app.put('/api/vocabs/:id/tags', authenticateToken, requireAdmin, async (req, res) => {
  const vocabId = Number(req.params.id);
  if (!Number.isInteger(vocabId)) return res.status(400).json({ error: 'Invalid vocab id' });
  const slugs = Array.isArray(req.body.tags) ? req.body.tags : null;
  if (!slugs) return res.status(400).json({ error: 'tags must be an array of slugs' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT 1 FROM vocabulary WHERE id = $1', [vocabId]);
    if (exists.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vocabulary not found' });
    }

    const found = await client.query('SELECT id, slug FROM tags WHERE slug = ANY($1)', [slugs]);
    const missing = slugs.filter((sl) => !found.rows.some((r) => r.slug === sl));
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Unknown tag(s): ' + missing.join(', ') });
    }

    await client.query('DELETE FROM vocab_tags WHERE vocab_id = $1', [vocabId]);
    for (const row of found.rows) {
      await client.query(
        'INSERT INTO vocab_tags (vocab_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [vocabId, row.id]
      );
    }

    await client.query('COMMIT');
    res.json({ vocab_id: vocabId, tags: found.rows.map((r) => r.slug) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Apply or remove ONE tag across many words at once. Hand-tagging 2869 words
// one at a time is not realistic, so the admin UI selects a batch and calls this.
app.post('/api/vocabs/tags/bulk', authenticateToken, requireAdmin, async (req, res) => {
  const { tag, action } = req.body;
  const vocabIds = Array.isArray(req.body.vocab_ids) ? req.body.vocab_ids : null;

  if (!tag) return res.status(400).json({ error: 'tag slug is required' });
  if (!vocabIds || vocabIds.length === 0) {
    return res.status(400).json({ error: 'vocab_ids must be a non-empty array' });
  }
  if (!['add', 'remove'].includes(action)) {
    return res.status(400).json({ error: "action must be 'add' or 'remove'" });
  }
  const ids = vocabIds.map(Number).filter(Number.isInteger);
  if (ids.length !== vocabIds.length) {
    return res.status(400).json({ error: 'vocab_ids must all be integers' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tagRes = await client.query('SELECT id FROM tags WHERE slug = $1 LIMIT 1', [tag]);
    if (tagRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Unknown tag: ${tag}` });
    }
    const tagId = tagRes.rows[0].id;

    let affected;
    if (action === 'add') {
      const r = await client.query(
        `INSERT INTO vocab_tags (vocab_id, tag_id)
         SELECT v.id, $2 FROM vocabulary v WHERE v.id = ANY($1)
         ON CONFLICT DO NOTHING`,
        [ids, tagId]
      );
      affected = r.rowCount;
    } else {
      const r = await client.query(
        'DELETE FROM vocab_tags WHERE tag_id = $1 AND vocab_id = ANY($2)',
        [tagId, ids]
      );
      affected = r.rowCount;
    }

    await client.query('COMMIT');
    res.json({ tag, action, requested: ids.length, affected });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Browse every word carrying a tag - "show me all substantiation verbs",
// across whichever notebooks they happen to live in.
app.get('/api/vocabs/by-tag/:slug', async (req, res) => {
  const slug = String(req.params.slug);
  try {
    const r = await pool.query(
      `SELECT ${vocabularySelectFields}
       FROM vocabulary v
       JOIN vocab_tags vt ON vt.vocab_id = v.id
       JOIN tags t ON t.id = vt.tag_id
       WHERE t.slug = $1
       ORDER BY v.word`,
      [slug]
    );
    res.json({ vocabs: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Replace a notebook's tag set. Built-in notebooks are admin-only; a user may
// retag their own.
app.put('/api/notebooks/:id/tags', authenticateToken, async (req, res) => {
  const notebookId = Number(req.params.id);
  if (!Number.isInteger(notebookId)) return res.status(400).json({ error: 'Invalid notebook id' });
  const slugs = Array.isArray(req.body.tags) ? req.body.tags : null;
  if (!slugs) return res.status(400).json({ error: 'tags must be an array of slugs' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const nb = await client.query('SELECT owner_user_id FROM notebooks WHERE id = $1', [notebookId]);
    if (nb.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Notebook not found' });
    }

    const owner = nb.rows[0].owner_user_id;
    const userId = Number(req.auth.userId);
    if (owner === null) {
      const admin = await client.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
      if (admin.rowCount === 0 || admin.rows[0].is_admin !== true) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Permission denied' });
      }
    } else if (Number(owner) !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Permission denied' });
    }

    const found = await client.query('SELECT id, slug FROM tags WHERE slug = ANY($1)', [slugs]);
    const missing = slugs.filter((sl) => !found.rows.some((r) => r.slug === sl));
    if (missing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Unknown tag(s): ' + missing.join(', ') });
    }

    await client.query('DELETE FROM notebook_tags WHERE notebook_id = $1', [notebookId]);
    for (const row of found.rows) {
      await client.query(
        'INSERT INTO notebook_tags (notebook_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [notebookId, row.id]
      );
    }

    await client.query('COMMIT');
    res.json({ notebook_id: notebookId, tags: found.rows.map((r) => r.slug) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.get('/api/vocabs/count', authenticateToken, async (req, res) => {
  try {
    // Đếm trực tiếp trên bảng vocabulary để đảm bảo các từ là duy nhất
    const q = 'SELECT COUNT(id)::int AS total_global_words FROM vocabulary';
    const r = await pool.query(q);
    
    res.json({ 
      total: r.rows[0].total_global_words 
    });
  } catch (err) {
    console.error('Get global vocab count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notebooks', authenticateToken, async (req, res) => {
  const { title, topic, difficulty, description } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    // topic/difficulty are legacy free-text; new notebooks classify via tags.
    const q = `
      INSERT INTO notebooks (title, topic, difficulty, description, owner_user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const r = await pool.query(q, [
      title, topic || '', difficulty || '', description || null, Number(req.auth.userId)
    ]);
    res.json({ notebook: r.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You already have a notebook with this title' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/notebooks/:id/vocabs', async (req, res) => {
  const notebookId = Number(req.params.id);
  if (!Number.isInteger(notebookId)) return res.status(400).json({ error: 'Invalid notebook id' });

  let userId = null;
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.sub;
    } catch (e) {
    }
  }

  try {
    const q = `
      SELECT ${vocabularySelectFields},
        uvp.repetition_level, uvp.interval_days, uvp.next_review_at, uvp.correct_streak, uvp.mastered
      FROM notebook_vocab nv
      JOIN vocabulary v ON v.id = nv.vocab_id
      LEFT JOIN user_vocab_progress uvp
        ON uvp.vocab_id = v.id AND ($1::BIGINT IS NOT NULL AND uvp.user_id = $1 OR $1::BIGINT IS NULL AND false)
      WHERE nv.notebook_id = $2
      ORDER BY nv.sort_order NULLS LAST, v.word, v.id
    `;
    const vals = [userId, notebookId];
    const r = await pool.query(q, vals);
    res.json({ vocabs: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/notebooks/:id/vocabs', authenticateToken, async (req, res) => {
  const notebookId = Number(req.params.id);
  const { word, meaning, english_meaning, vietnamese_meaning, synonyms, phonetic, example } = req.body;
  if (!Number.isInteger(notebookId)) return res.status(400).json({ error: 'Invalid notebook id' });
  if (!word) return res.status(400).json({ error: 'Word is required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert or update vocabulary
    const vocabQ = `
      INSERT INTO vocabulary (word, meaning, english_meaning, vietnamese_meaning, synonyms, phonetic, example)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (word) DO UPDATE SET
        meaning = EXCLUDED.meaning,
        english_meaning = COALESCE(EXCLUDED.english_meaning, vocabulary.english_meaning),
        vietnamese_meaning = COALESCE(EXCLUDED.vietnamese_meaning, vocabulary.vietnamese_meaning),
        synonyms = COALESCE(EXCLUDED.synonyms, vocabulary.synonyms),
        phonetic = COALESCE(EXCLUDED.phonetic, vocabulary.phonetic),
        example = COALESCE(EXCLUDED.example, vocabulary.example)
      RETURNING *
    `;
    const vocabRes = await client.query(vocabQ, [
      word.trim(), meaning || '', english_meaning || '', vietnamese_meaning || '', synonyms || '', phonetic || '', example || ''
    ]);
    const newVocab = vocabRes.rows[0];

    // Add to notebook (ignore if already added)
    const linkQ = `
      INSERT INTO notebook_vocab (notebook_id, vocab_id)
      VALUES ($1, $2)
      ON CONFLICT (notebook_id, vocab_id) DO NOTHING
    `;
    await client.query(linkQ, [notebookId, newVocab.id]);

    await client.query('COMMIT');
    res.json({ vocab: newVocab });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.put('/api/vocabs/:id', authenticateToken, requireAdmin, async (req, res) => {
  const vocabId = Number(req.params.id);
  if (!Number.isInteger(vocabId)) return res.status(400).json({ error: 'Invalid vocab id' });
  
  const { word, meaning, english_meaning, vietnamese_meaning, synonyms, phonetic, example } = req.body;
  if (!word) return res.status(400).json({ error: 'Word is required' });

  try {
    const q = `
      UPDATE vocabulary 
      SET 
        word = $1, 
        meaning = $2, 
        english_meaning = $3, 
        vietnamese_meaning = $4, 
        synonyms = $5, 
        phonetic = $6, 
        example = $7
      WHERE id = $8
      RETURNING *
    `;
    const r = await pool.query(q, [
      word.trim(), meaning || '', english_meaning || '', vietnamese_meaning || '', synonyms || '', phonetic || '', example || '', vocabId
    ]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Vocabulary not found' });
    res.json({ vocab: r.rows[0] });
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Word already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/repetition/summary', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const notebookId = req.query.notebook_id ? Number(req.query.notebook_id) : null;
  try {
    let q = `
      SELECT
          SUM((next_review_at <= now())::int) AS due_now,
          SUM((next_review_at > now() AND next_review_at <= now() + INTERVAL '1 day')::int) AS due_1,
          SUM((next_review_at > now() + INTERVAL '1 day' AND next_review_at <= now() + INTERVAL '3 days')::int) AS due_3,
          SUM((next_review_at > now() + INTERVAL '3 days' AND next_review_at <= now() + INTERVAL '7 days')::int) AS due_7,
          SUM((next_review_at > now() + INTERVAL '7 days' AND next_review_at <= now() + INTERVAL '14 days')::int) AS due_14,
          SUM((mastered AND next_review_at > now())::int) AS mastered
      FROM user_vocab_progress uvp
    `;
    let vals = [userId];
    if (notebookId) {
      q += `
        JOIN notebook_vocab nv ON nv.vocab_id = uvp.vocab_id
        WHERE uvp.user_id = $1 AND nv.notebook_id = $2
      `;
      vals.push(notebookId);
    } else {
      q += ` WHERE uvp.user_id = $1 `;
    }

    const r = await pool.query(q, vals);
    const row = r.rows[0];
    res.json({
      due_now: parseInt(row.due_now || 0, 10),
      due_1: parseInt(row.due_1 || 0, 10),
      due_3: parseInt(row.due_3 || 0, 10),
      due_7: parseInt(row.due_7 || 0, 10),
      due_14: parseInt(row.due_14 || 0, 10),
      mastered: parseInt(row.mastered || 0, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/repetition/items', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const bucket = String(req.query.bucket || '');
  const notebookId = req.query.notebook_id ? Number(req.query.notebook_id) : null;

  const conditions = {
    due_now: 'uvp.next_review_at <= now()',
    due_1: "uvp.next_review_at > now() AND uvp.next_review_at <= now() + INTERVAL '1 day'",
    due_3: "uvp.next_review_at > now() + INTERVAL '1 day' AND uvp.next_review_at <= now() + INTERVAL '3 days'",
    due_7: "uvp.next_review_at > now() + INTERVAL '3 days' AND uvp.next_review_at <= now() + INTERVAL '7 days'",
    due_14: "uvp.next_review_at > now() + INTERVAL '7 days' AND uvp.next_review_at <= now() + INTERVAL '14 days'",
    mastered: 'uvp.mastered = TRUE AND uvp.next_review_at > now()'
  };

  const whereCondition = conditions[bucket];
  if (!whereCondition) {
    return res.status(400).json({ error: 'Invalid bucket' });
  }

  try {
    let q = `
      SELECT
        ${vocabularySelectFields},
        uvp.repetition_level, uvp.interval_days, uvp.next_review_at, uvp.correct_streak, uvp.mastered
      FROM user_vocab_progress uvp
      JOIN vocabulary v ON v.id = uvp.vocab_id
    `;
    let vals = [userId];
    if (notebookId) {
      q += ` JOIN notebook_vocab nv ON nv.vocab_id = uvp.vocab_id `;
      q += ` WHERE uvp.user_id = $1 AND ${whereCondition} AND nv.notebook_id = $2 `;
      vals.push(notebookId);
    } else {
      q += ` WHERE uvp.user_id = $1 AND ${whereCondition} `;
    }
    q += ` ORDER BY uvp.repetition_level ASC, uvp.next_review_at ASC, v.word ASC `;
    
    const r = await pool.query(q, vals);
    return res.json({ vocabs: r.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

function getIntervalDaysForLevel(level) {
  if (level < 0) return 0;
  const intervalByLevel = {
    0: 1,
    1: 3,
    2: 7,
    3: 14,
    4: 30
  };
  if (Object.prototype.hasOwnProperty.call(intervalByLevel, level)) {
    return intervalByLevel[level];
  }
  return 30;
}

app.get('/api/notebooks/:id/review-sequence', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const notebookId = Number(req.params.id);
  if (!Number.isInteger(notebookId)) {
    return res.status(400).json({ error: 'Invalid notebook id' });
  }

  try {
    const vocabQ = `
      SELECT ${vocabularySelectFields}
      FROM notebook_vocab nv
      JOIN vocabulary v ON v.id = nv.vocab_id
      WHERE nv.notebook_id = $1
      ORDER BY nv.sort_order NULLS LAST, v.word, v.id
    `;
    const vocabRes = await pool.query(vocabQ, [notebookId]);
    const vocabs = vocabRes.rows;
    if (vocabs.length === 0) {
      return res.json({ vocabs: [], currentIndex: 0, currentWordId: null });
    }

    const progressRes = await pool.query(
      'SELECT current_word_id FROM user_notebook_progress WHERE user_id = $1 AND notebook_id = $2 LIMIT 1',
      [userId, notebookId]
    );

    const currentWordId = progressRes.rowCount > 0 ? progressRes.rows[0].current_word_id : null;
    let currentIndex = 0;

    if (currentWordId !== null) {
      const idx = vocabs.findIndex((v) => Number(v.id) === Number(currentWordId));
      currentIndex = idx >= 0 ? idx : 0;
    }

    return res.json({ vocabs, currentIndex, currentWordId: currentWordId || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/repetition/split-chunk', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find or create this user's own 'Chunk' notebook. It used to be a single
    //    global notebook, so one user rebuilding their chunk wiped everyone else's.
    let chunkNbRes = await client.query(
      `SELECT id FROM notebooks WHERE title = 'Chunk' AND owner_user_id = $1 LIMIT 1`,
      [userId]
    );
    if (chunkNbRes.rowCount === 0) {
      chunkNbRes = await client.query(
        `INSERT INTO notebooks (title, topic, difficulty, owner_user_id)
         VALUES ('Chunk', 'Custom', 'mixed', $1) RETURNING id`,
        [userId]
      );
    }
    const chunkId = chunkNbRes.rows[0].id;

    // 2. Clear existing words in this notebook
    await client.query(`DELETE FROM notebook_vocab WHERE notebook_id = $1`, [chunkId]);

    // 3. Find 30 words due now
    const wordsRes = await client.query(`
      SELECT uvp.vocab_id 
      FROM user_vocab_progress uvp
      WHERE uvp.user_id = $1 AND uvp.next_review_at <= now()
      ORDER BY uvp.repetition_level ASC, uvp.next_review_at ASC
      LIMIT 30
    `, [userId]);

    const vocabIds = wordsRes.rows.map(r => r.vocab_id);
    
    if (vocabIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Không có từ nào cần ôn tập hiện tại.' });
    }

    // 4. Insert these words into the chunk notebook
    const valuesParams = vocabIds.map((id, index) => `($1, $${index + 2})`).join(', ');
    const queryParams = [chunkId, ...vocabIds];
    await client.query(
      `INSERT INTO notebook_vocab (notebook_id, vocab_id) VALUES ${valuesParams}`,
      queryParams
    );

    await client.query('COMMIT');
    res.json({ message: 'Chunk created successfully', notebook_id: chunkId, word_count: vocabIds.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

app.post('/api/notebooks/:id/review-step', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const notebookId = Number(req.params.id);
  const vocab_id = Number(req.body.vocab_id);
  const correct_count = req.body.correct_count;

  if (!Number.isInteger(notebookId) || !Number.isInteger(vocab_id)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get vocab list for notebook to find next word
    const vocabQ = `
      SELECT v.id
      FROM notebook_vocab nv
      JOIN vocabulary v ON v.id = nv.vocab_id
      WHERE nv.notebook_id = $1
      ORDER BY nv.sort_order NULLS LAST, v.word, v.id
    `;
    const vocabRes = await client.query(vocabQ, [notebookId]);
    const vocabs = vocabRes.rows;
    
    if (vocabs.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ nextIndex: 0, currentWordId: null });
    }

    // 2. Apply Spaced Repetition logic
    if (correct_count !== undefined) {
      await applyQuizResult(client, userId, vocab_id, correct_count);
    }

    // 3. Find next index
    const currentIndex = vocabs.findIndex(v => Number(v.id) === Number(vocab_id));
    let nextIndex = 0;
    if (currentIndex >= 0 && currentIndex < vocabs.length - 1) {
      nextIndex = currentIndex + 1;
    }
    const nextWordId = vocabs[nextIndex].id;

    // 4. Update user_notebook_progress
    await client.query(`
      INSERT INTO user_notebook_progress (user_id, notebook_id, current_word_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, notebook_id) DO UPDATE SET current_word_id = $3
    `, [userId, notebookId, nextWordId]);

    await client.query('COMMIT');
    return res.json({ nextIndex, currentWordId: nextWordId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/* ---------- NEW GLOBAL SEARCH ---------- */
app.get('/api/search', async (req, res) => {
  const q = req.query.q || '';
  const notebookId = req.query.notebook_id ? Number(req.query.notebook_id) : null;
  
  if (!q.trim()) {
    return res.json({ vocabs: [] });
  }

  try {
    // $1 = exact word, $2 = starts with, $3 = contains anywhere
    let notebookFilter = '';
    let vals = [q.trim(), `${q.trim()}%`, `%${q.trim()}%`];
    
    if (notebookId) {
      notebookFilter = ` AND nv.notebook_id = $4`;
      vals.push(notebookId);
    }

    const sql = `
      WITH matched AS (
        SELECT DISTINCT v.id, v.word, v.meaning, v.phonetic, v.image_url,
          v.english_meaning, v.vietnamese_meaning, v.synonyms, v.example
        FROM vocabulary v
        LEFT JOIN notebook_vocab nv ON nv.vocab_id = v.id
        WHERE (
          v.word ILIKE $3
          OR v.meaning ILIKE $3
          OR v.english_meaning ILIKE $3
          OR v.vietnamese_meaning ILIKE $3
          OR v.synonyms ILIKE $3
        )${notebookFilter}
      )
      SELECT m.*,
        COALESCE((
          SELECT JSON_AGG(JSONB_BUILD_OBJECT('slug', t.slug, 'label', t.label, 'kind', t.kind)
                          ORDER BY t.kind, t.label)
          FROM vocab_tags vt JOIN tags t ON t.id = vt.tag_id
          WHERE vt.vocab_id = m.id
        ), '[]') AS tags
      FROM matched m
      ORDER BY
        CASE
          WHEN m.word ILIKE $1 THEN 1
          WHEN m.word ILIKE $2 THEN 2
          WHEN m.word ILIKE $3 THEN 3
          WHEN m.synonyms ILIKE $3 THEN 4
          ELSE 5
        END,
        m.word ASC
      LIMIT 50
    `;
    
    const r = await pool.query(sql, vals);
    res.json({ vocabs: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------- NEW QUIZ ENDPOINTS ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

app.get('/api/quiz/generate', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const bucket = String(req.query.bucket || '');
  const notebookId = req.query.notebook_id ? Number(req.query.notebook_id) : null;

  const conditions = {
    due_now: 'uvp.next_review_at <= now()',
    due_1: "uvp.next_review_at > now() AND uvp.next_review_at <= now() + INTERVAL '1 day'",
    due_3: "uvp.next_review_at > now() + INTERVAL '1 day' AND uvp.next_review_at <= now() + INTERVAL '3 days'",
    due_7: "uvp.next_review_at > now() + INTERVAL '3 days' AND uvp.next_review_at <= now() + INTERVAL '7 days'",
    due_14: "uvp.next_review_at > now() + INTERVAL '7 days' AND uvp.next_review_at <= now() + INTERVAL '14 days'",
    mastered: 'uvp.mastered = TRUE AND uvp.next_review_at > now()'
  };

  const whereCondition = conditions[bucket];
  if (!whereCondition) {
    return res.status(400).json({ error: 'Invalid bucket' });
  }

  try {
    // 1. Get up to 10 words for this user from the bucket
    let q = `
      SELECT
        ${vocabularySelectFields},
        uvp.repetition_level, uvp.interval_days, uvp.next_review_at, uvp.correct_streak, uvp.mastered
      FROM user_vocab_progress uvp
      JOIN vocabulary v ON v.id = uvp.vocab_id
    `;
    let vals = [userId];
    if (notebookId) {
      q += ` JOIN notebook_vocab nv ON nv.vocab_id = uvp.vocab_id `;
      q += ` WHERE uvp.user_id = $1 AND ${whereCondition} AND nv.notebook_id = $2 `;
      vals.push(notebookId);
    } else {
      q += ` WHERE uvp.user_id = $1 AND ${whereCondition} `;
    }
    q += ` ORDER BY uvp.next_review_at ASC, v.word ASC LIMIT 10`;//` ORDER BY uvp.repetition_level ASC, uvp.next_review_at ASC, v.word ASC LIMIT 10`;
    
    const wordsRes = await pool.query(q, vals);
    const words = wordsRes.rows;
    
    if (words.length === 0) {
      return res.json({ words: [], questions: [] });
    }

    // 2. Generate questions
    const questions = [];
    
    for (const w of words) {
      // Get 3 random wrong words from the same notebook(s) first
      let wrongRes = await pool.query(
        `WITH same_notebook_words AS (
           SELECT DISTINCT v.id, v.word, v.meaning, v.english_meaning, v.vietnamese_meaning, v.phonetic
           FROM vocabulary v
           JOIN notebook_vocab nv1 ON v.id = nv1.vocab_id
           JOIN notebook_vocab nv2 ON nv1.notebook_id = nv2.notebook_id
           WHERE nv2.vocab_id = $1 AND v.id != $1
         )
         SELECT * FROM same_notebook_words ORDER BY RANDOM() LIMIT 3`,
        [w.id]
      );
      let wrongWords = wrongRes.rows;

      // If not enough words in the same notebook(s), fallback to full DB
      if (wrongWords.length < 3) {
        const excludeIds = [w.id, ...wrongWords.map(ww => ww.id)];
        const placeholders = excludeIds.map((_, i) => `$${i + 1}`).join(',');
        const fallbackRes = await pool.query(
          `SELECT id, word, meaning, english_meaning, vietnamese_meaning, phonetic
           FROM vocabulary
           WHERE id NOT IN (${placeholders})
           ORDER BY RANDOM() LIMIT ${3 - wrongWords.length}`,
          excludeIds
        );
        wrongWords = wrongWords.concat(fallbackRes.rows);
      }

      // Question 1: word_to_meaning
      const q1Options = [
        { 
          key: 'correct', 
          text: w.english_meaning || w.meaning || w.vietnamese_meaning || 'No meaning provided',
          word: w.word,
          english_meaning: w.english_meaning || w.meaning,
          vietnamese_meaning: w.vietnamese_meaning || w.meaning,
          phonetic: w.phonetic
        },
        ...wrongWords.map((ww, i) => ({
          key: `wrong_${i}`,
          text: ww.english_meaning || ww.meaning || ww.vietnamese_meaning || 'No meaning provided',
          word: ww.word,
          english_meaning: ww.english_meaning || ww.meaning,
          vietnamese_meaning: ww.vietnamese_meaning || ww.meaning,
          phonetic: ww.phonetic
        }))
      ];
      const q1Shuffled = shuffle(q1Options).map((o, idx) => ({ ...o, displayKey: String.fromCharCode(97 + idx) }));
      
      questions.push({
        type: 'word_to_meaning',
        vocab_id: w.id,
        prompt: w.word,
        phonetic: w.phonetic,
        options: q1Shuffled.map(o => ({ 
          key: o.displayKey, 
          text: o.text,
          word: o.word,
          english_meaning: o.english_meaning,
          vietnamese_meaning: o.vietnamese_meaning,
          phonetic: o.phonetic
        })),
        correct_key: q1Shuffled.find(o => o.key === 'correct').displayKey
      });

      // Question 2: meaning_to_word
      const q2Options = [
        { 
          key: 'correct', 
          text: w.word, 
          english_meaning: w.english_meaning || w.meaning, 
          vietnamese_meaning: w.vietnamese_meaning || w.meaning,
          phonetic: w.phonetic
        },
        ...wrongWords.map((ww, i) => ({
          key: `wrong_${i}`,
          text: ww.word,
          english_meaning: ww.english_meaning || ww.meaning,
          vietnamese_meaning: ww.vietnamese_meaning || ww.meaning,
          phonetic: ww.phonetic
        }))
      ];
      const q2Shuffled = shuffle(q2Options).map((o, idx) => ({ ...o, displayKey: String.fromCharCode(97 + idx) }));

      questions.push({
        type: 'meaning_to_word',
        vocab_id: w.id,
        prompt: w.vietnamese_meaning || w.meaning || w.english_meaning || w.word,
        options: q2Shuffled.map(o => ({ 
          key: o.displayKey, 
          text: o.text,
          english_meaning: o.english_meaning,
          vietnamese_meaning: o.vietnamese_meaning,
          phonetic: o.phonetic
        })),
        correct_key: q2Shuffled.find(o => o.key === 'correct').displayKey
      });
    }

    res.json({
      words,
      questions: shuffle(questions)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function applyQuizResult(client, userId, vocabId, correctCount) {
  const now = new Date();
  const getRes = await client.query('SELECT * FROM user_vocab_progress WHERE user_id = $1 AND vocab_id = $2 LIMIT 1', [userId, vocabId]);

  if (getRes.rowCount === 0) {
    let repetitionLevel = -1;
    let intervalDays = 0;
    
    if (correctCount === 2) {
      repetitionLevel = 0;
      intervalDays = getIntervalDaysForLevel(0);
    } else if (correctCount === 1) {
      repetitionLevel = -1;
      intervalDays = 0;
    }
    
    const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 3600 * 1000);
    const correctStreak = correctCount === 2 ? 1 : 0;
    const mastered = repetitionLevel >= 4;

    const insertQ = `INSERT INTO user_vocab_progress
      (user_id, vocab_id, repetition_level, interval_days, next_review_at, last_reviewed_at, correct_streak, total_reviews, mastered, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      RETURNING *`;
    const insertVals = [userId, vocabId, repetitionLevel, intervalDays, nextReviewAt, now, correctStreak, 1, mastered];
    const ins = await client.query(insertQ, insertVals);
    return ins.rows[0];
  }

  const row = getRes.rows[0];
  let currentLevel = Number.isInteger(row.repetition_level) ? row.repetition_level : 0;
  let newLevel = currentLevel;
  let correctStreak = row.correct_streak || 0;
  const totalReviews = (row.total_reviews || 0) + 1;

  if (correctCount === 0) {
    newLevel = currentLevel <= 0 ? currentLevel - 1 : -1;
    correctStreak = 0;
  } else if (correctCount === 1) {
    newLevel = currentLevel;
  } else if (correctCount === 2) {
    newLevel = currentLevel < 0 ? 0 : Math.min(currentLevel + 1, 4);
    correctStreak += 1;
  }

  const intervalDays = getIntervalDaysForLevel(newLevel);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 3600 * 1000);
  const mastered = newLevel >= 4;

  const updateQ = `
    UPDATE user_vocab_progress
    SET repetition_level = $1,
        interval_days = $2,
        next_review_at = $3,
        last_reviewed_at = $4,
        correct_streak = $5,
        total_reviews = $6,
        mastered = $7,
        updated_at = NOW()
    WHERE user_id = $8 AND vocab_id = $9
    RETURNING *
  `;
  const updateVals = [newLevel, intervalDays, nextReviewAt, now, correctStreak, totalReviews, mastered, userId, vocabId];
  const ur = await client.query(updateQ, updateVals);
  return ur.rows[0];
}

app.post('/api/quiz/submit', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const results = req.body.results; // Array of { vocab_id, correct_count }

  if (!Array.isArray(results)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updatedProgress = [];
    
    for (const r of results) {
      if (Number.isInteger(r.vocab_id) && r.correct_count >= 0 && r.correct_count <= 2) {
        const progress = await applyQuizResult(client, userId, r.vocab_id, r.correct_count);
        updatedProgress.push({
          vocab_id: progress.vocab_id,
          new_level: progress.repetition_level,
          next_review_at: progress.next_review_at
        });
      }
    }
    
    await client.query('COMMIT');
    return res.json({ results: updatedProgress });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/* ---------- STATIC CLIENT (production image) ---------- */
// Present only when the client has been built (the Docker image does this).
// In local development Vite serves the frontend on its own port instead.
const clientDist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  // React Router: anything that is not /api and not a real file gets index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`Serving client build from ${clientDist}`);
}

const port = Number.parseInt(process.env.PORT || '8000', 10);

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});