-- 006_question_bank.sql
--
-- The 440 "word in context" multiple-choice questions. They have lived in
-- server/assets/440-wic-question.json since the beginning without ever reaching
-- the database.
--
-- question_vocab is the point of the whole thing: it links a question to the
-- vocabulary rows it exercises, which is what makes "show me questions built on
-- words I have studied" a query rather than a text search.

CREATE TABLE IF NOT EXISTS question_sets (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  source VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  set_id BIGINT REFERENCES question_sets(id) ON DELETE CASCADE,
  external_id INTEGER,                  -- the 1..440 number in the source file
  prompt TEXT NOT NULL,
  question_type VARCHAR(30) NOT NULL,   -- 'word_in_context' | 'general'
  options JSONB NOT NULL,               -- {"A": "typical", "B": ...}
  answer_key VARCHAR(4) NOT NULL,
  explanation TEXT,
  difficulty VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (set_id, external_id)
);

-- role: 'target' = the word the question asks about (quoted in the prompt)
--       'option' = one of the four answer choices
-- surface_form keeps the inflected spelling as it appears ("prized"), while
-- vocab_id points at the dictionary entry ("prize").
CREATE TABLE IF NOT EXISTS question_vocab (
  question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  surface_form VARCHAR(255),
  PRIMARY KEY (question_id, vocab_id, role)
);

CREATE INDEX IF NOT EXISTS idx_question_vocab_vocab ON question_vocab(vocab_id);
CREATE INDEX IF NOT EXISTS idx_question_vocab_question ON question_vocab(question_id);

CREATE TABLE IF NOT EXISTS user_question_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
  selected_key VARCHAR(4),
  is_correct BOOLEAN,
  answered_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uqa_user ON user_question_attempts(user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_uqa_user_question ON user_question_attempts(user_id, question_id);
