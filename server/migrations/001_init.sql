-- 001_init.sql
-- Base schema. Safe to run against an existing database: every statement is
-- IF NOT EXISTS, so a database created before migrations existed is adopted
-- rather than rebuilt.
-- users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- global notebooks
CREATE TABLE IF NOT EXISTS notebooks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) UNIQUE NOT NULL,
    topic VARCHAR(255) NOT NULL,
    difficulty VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- global vocabulary
CREATE TABLE IF NOT EXISTS vocabulary (
  id BIGSERIAL PRIMARY KEY,
  word VARCHAR(255) UNIQUE NOT NULL,
  meaning TEXT,
  english_meaning TEXT,
  vietnamese_meaning TEXT,
  synonyms TEXT,
  phonetic VARCHAR(255),
  example TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- notebook <-> vocab relation
CREATE TABLE IF NOT EXISTS notebook_vocab (
  notebook_id BIGINT REFERENCES notebooks(id) ON DELETE CASCADE,
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
  sort_order INTEGER,
  PRIMARY KEY (notebook_id, vocab_id)
);

-- per-user progress
CREATE TABLE IF NOT EXISTS user_vocab_progress (
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,

  repetition_level INTEGER DEFAULT 0,
  interval_days INTEGER DEFAULT 0,

  next_review_at TIMESTAMP NOT NULL,
  last_reviewed_at TIMESTAMP,

  correct_streak INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  mastered BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (user_id, vocab_id)
);

CREATE INDEX IF NOT EXISTS idx_user_review_time ON user_vocab_progress(user_id, next_review_at);

CREATE TABLE IF NOT EXISTS user_notebook_progress (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    notebook_id INTEGER REFERENCES notebooks(id) ON DELETE CASCADE,
    current_word_id INTEGER REFERENCES vocabulary(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, notebook_id)
);
