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

const vocabularySelectFields = `
  v.id, v.word, v.meaning, v.phonetic, v.example, v.image_url,
  v.english_meaning, v.vietnamese_meaning, v.synonyms
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

app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

app.get('/api/auth/me', authenticateToken, async (req, res) => {
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

/* ---------- API endpoints for notebooks/vocab/repetition ---------- */

app.get('/api/notebooks', async (req, res) => {
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
          SUM((mastered)::int) AS mastered
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
    mastered: 'uvp.mastered = TRUE'
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

    // 1. Find or create the 'Chunk' notebook
    let chunkNbRes = await client.query(`SELECT id FROM notebooks WHERE title = 'Chunk' LIMIT 1`);
    if (chunkNbRes.rowCount === 0) {
      chunkNbRes = await client.query(
        `INSERT INTO notebooks (title, topic, difficulty) VALUES ('Chunk', 'Custom', 'mixed') RETURNING id`
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
  const { vocab_id, correct_count } = req.body; // 0 for wrong, 2 for right

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
          v.english_meaning, v.vietnamese_meaning, v.synonyms
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
      SELECT * FROM matched
      ORDER BY 
        CASE
          WHEN word ILIKE $1 THEN 1
          WHEN word ILIKE $2 THEN 2
          WHEN word ILIKE $3 THEN 3
          WHEN synonyms ILIKE $3 THEN 4
          ELSE 5
        END,
        word ASC
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
    mastered: 'uvp.mastered = TRUE'
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
    q += ` ORDER BY uvp.repetition_level ASC, uvp.next_review_at ASC, v.word ASC LIMIT 10`;
    
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

const port = Number.parseInt(process.env.PORT || '4000', 10);

app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
});