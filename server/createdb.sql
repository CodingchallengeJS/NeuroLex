-- create_schema.sql
-- WARNING: this will DROP schema public (remove if you don't want)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- users
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(30) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- global notebooks
CREATE TABLE notebooks (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) UNIQUE NOT NULL,
    topic VARCHAR(255) NOT NULL,
    difficulty VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- global vocabulary
CREATE TABLE vocabulary (
  id BIGSERIAL PRIMARY KEY,
  word VARCHAR(255) UNIQUE NOT NULL,
  meaning TEXT,
  phonetic VARCHAR(255),
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- notebook <-> vocab relation
CREATE TABLE notebook_vocab (
  notebook_id BIGINT REFERENCES notebooks(id) ON DELETE CASCADE,
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
  PRIMARY KEY (notebook_id, vocab_id)
);

-- per-user progress
CREATE TABLE user_vocab_progress (
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

CREATE INDEX idx_user_review_time ON user_vocab_progress(user_id, next_review_at);

CREATE TABLE user_notebook_progress (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    notebook_id INTEGER REFERENCES notebooks(id) ON DELETE CASCADE,
    current_word_id INTEGER REFERENCES vocabulary(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, notebook_id)
);