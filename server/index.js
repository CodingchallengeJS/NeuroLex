const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

dotenv.config();

const app = express();

const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
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

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

app.use(cors());
app.use(express.json());

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

/* ---------- health + auth (same as your original) ---------- */

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Database unavailable' });
  }
});

app.post('/auth/register', async (req, res) => {
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

    const insertResult = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [normalizedUsername, normalizedEmail, passwordHash]
    );

    const user = insertResult.rows[0];
    return res.status(201).json({
      message: 'Register success',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userResult = await pool.query('SELECT id, username, email, password_hash, created_at FROM users WHERE email = $1 LIMIT 1', [
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
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT id, username, email, created_at FROM users WHERE id = $1 LIMIT 1', [
      req.auth.userId
    ]);
    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const user = userResult.rows[0];
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------- New API endpoints for notebooks/vocab/repetition ---------- */

/**
 * GET /notebooks
 * return list of global notebooks with vocab count
 */
app.get('/notebooks', async (req, res) => {
  try {
    const q = `
      SELECT n.id, n.title, n.topic, n.difficulty,
        (SELECT COUNT(*) FROM notebook_vocab nv WHERE nv.notebook_id = n.id) AS vocab_count
      FROM notebooks n
      ORDER BY n.id
    `;
    const r = await pool.query(q);
    res.json({ notebooks: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /notebooks/:id/vocabs
 * Optionally includes user progress if Authorization header present
 */
app.get('/notebooks/:id/vocabs', async (req, res) => {
  const notebookId = Number(req.params.id);
  if (!Number.isInteger(notebookId)) return res.status(400).json({ error: 'Invalid notebook id' });

  // try to get user id from token (optional)
  let userId = null;
  const token = extractBearerToken(req.headers.authorization);
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      userId = payload.sub;
    } catch (e) {
      // ignore invalid token; treat as guest
    }
  }

  try {
    const q = `
      SELECT v.id, v.word, v.meaning, v.phonetic, v.image_url,
        uvp.repetition_level, uvp.interval_days, uvp.next_review_at, uvp.correct_streak, uvp.mastered
      FROM notebook_vocab nv
      JOIN vocabulary v ON v.id = nv.vocab_id
      LEFT JOIN user_vocab_progress uvp
        ON uvp.vocab_id = v.id AND ($1::BIGINT IS NOT NULL AND uvp.user_id = $1 OR $1::BIGINT IS NULL AND false)
      WHERE nv.notebook_id = $2
      ORDER BY v.word
    `;
    const vals = [userId, notebookId];
    const r = await pool.query(q, vals);
    res.json({ vocabs: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /repetition/summary
 * require auth
 * returns counts for today, tomorrow, +3, +7, +14, mastered
 */
app.get('/repetition/summary', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  try {
    const q = `
      SELECT
        SUM((next_review_at <= now())::int) AS due_now,
        SUM((date(next_review_at) = date(now() + INTERVAL '1 day'))::int) AS due_1,
        SUM((date(next_review_at) = date(now() + INTERVAL '3 day'))::int) AS due_3,
        SUM((date(next_review_at) = date(now() + INTERVAL '7 day'))::int) AS due_7,
        SUM((date(next_review_at) = date(now() + INTERVAL '14 day'))::int) AS due_14,
        SUM((mastered)::int) AS mastered
      FROM user_vocab_progress
      WHERE user_id = $1
    `;
    const r = await pool.query(q, [userId]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /repetition/items?bucket=due_now|due_1|due_3|due_7|due_14|mastered
 * require auth
 * returns vocab items in selected repetition bucket
 */
app.get('/repetition/items', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const bucket = String(req.query.bucket || '');
  const conditions = {
    due_now: 'uvp.next_review_at <= now()',
    due_1: "date(uvp.next_review_at) = date(now() + INTERVAL '1 day')",
    due_3: "date(uvp.next_review_at) = date(now() + INTERVAL '3 day')",
    due_7: "date(uvp.next_review_at) = date(now() + INTERVAL '7 day')",
    due_14: "date(uvp.next_review_at) = date(now() + INTERVAL '14 day')",
    mastered: 'uvp.mastered = TRUE'
  };

  const whereCondition = conditions[bucket];
  if (!whereCondition) {
    return res.status(400).json({ error: 'Invalid bucket' });
  }

  try {
    const q = `
      SELECT
        v.id, v.word, v.meaning, v.phonetic, v.image_url,
        uvp.repetition_level, uvp.interval_days, uvp.next_review_at, uvp.correct_streak, uvp.mastered
      FROM user_vocab_progress uvp
      JOIN vocabulary v ON v.id = uvp.vocab_id
      WHERE uvp.user_id = $1 AND ${whereCondition}
      ORDER BY uvp.next_review_at ASC, v.word ASC
    `;
    const r = await pool.query(q, [userId]);
    return res.json({ vocabs: r.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

function getIntervalDaysForLevel(level) {
  const intervalByLevel = {
    '-1': 0,
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

async function applyReviewResult(client, userId, vocabId, result) {
  const now = new Date();
  const getRes = await client.query('SELECT * FROM user_vocab_progress WHERE user_id = $1 AND vocab_id = $2 LIMIT 1', [userId, vocabId]);

  if (getRes.rowCount === 0) {
    const repetitionLevel = result === 'correct' ? 0 : -1;
    const intervalDays = getIntervalDaysForLevel(repetitionLevel);
    const nextReviewAt = new Date(now.getTime() + intervalDays * 24 * 3600 * 1000);
    const correctStreak = result === 'correct' ? 1 : 0;
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
  let newLevel = Number.isInteger(row.repetition_level) ? row.repetition_level : 0;
  let correctStreak = row.correct_streak || 0;
  const totalReviews = (row.total_reviews || 0) + 1;

  if (result === 'wrong') {
    newLevel = -1;
    correctStreak = 0;
  } else {
    newLevel = Math.min(newLevel + 1, 4);
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

/**
 * GET /notebooks/:id/review-sequence
 * require auth
 * Return notebook vocab list + current index based on user_notebook_progress.current_word_id
 */
app.get('/notebooks/:id/review-sequence', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const notebookId = Number(req.params.id);
  if (!Number.isInteger(notebookId)) {
    return res.status(400).json({ error: 'Invalid notebook id' });
  }

  try {
    const vocabQ = `
      SELECT v.id, v.word, v.meaning, v.phonetic, v.image_url
      FROM notebook_vocab nv
      JOIN vocabulary v ON v.id = nv.vocab_id
      WHERE nv.notebook_id = $1
      ORDER BY v.word, v.id
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

/**
 * POST /notebooks/:id/review-step
 * body: { vocab_id: number, result: 'correct' | 'wrong' }
 * require auth
 * Update vocab progress and advance notebook current_word_id to next vocab (wrap at end)
 */
app.post('/notebooks/:id/review-step', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const notebookId = Number(req.params.id);
  const vocabId = Number(req.body.vocab_id);
  const result = req.body.result;

  if (!Number.isInteger(notebookId) || !Number.isInteger(vocabId) || !['correct', 'wrong'].includes(result)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sequenceRes = await client.query(
      `
      SELECT v.id
      FROM notebook_vocab nv
      JOIN vocabulary v ON v.id = nv.vocab_id
      WHERE nv.notebook_id = $1
      ORDER BY v.word, v.id
      `,
      [notebookId]
    );
    const sequence = sequenceRes.rows.map((r) => Number(r.id));
    if (sequence.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Notebook has no vocabulary' });
    }

    const currentPos = sequence.indexOf(vocabId);
    if (currentPos === -1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Vocabulary is not in this notebook' });
    }

    const progress = await applyReviewResult(client, userId, vocabId, result);

    const nextPos = (currentPos + 1) % sequence.length;
    const nextWordId = sequence[nextPos];

    await client.query(
      `
      INSERT INTO user_notebook_progress (user_id, notebook_id, current_word_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, notebook_id)
      DO UPDATE SET current_word_id = EXCLUDED.current_word_id
      `,
      [userId, notebookId, nextWordId]
    );

    await client.query('COMMIT');
    return res.json({ progress, nextWordId, nextIndex: nextPos, totalWords: sequence.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * POST /review
 * body: { vocab_id: number, result: 'correct' | 'wrong' }
 * require auth
 *
 * Implements fixed-level spaced repetition:
 * intervals = [1,3,7,14,30,60]
 */
app.post('/review', authenticateToken, async (req, res) => {
  const userId = Number(req.auth.userId);
  const vocabId = Number(req.body.vocab_id);
  const result = req.body.result;

  if (!Number.isInteger(vocabId) || !['correct', 'wrong'].includes(result)) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const progress = await applyReviewResult(client, userId, vocabId, result);
    await client.query('COMMIT');
    return res.json({ progress });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});


const port = Number.parseInt(process.env.PORT || '4000', 10);
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
