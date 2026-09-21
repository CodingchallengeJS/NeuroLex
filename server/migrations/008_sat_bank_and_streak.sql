-- 008_sat_bank_and_streak.sql
--
-- Three unrelated-looking pieces that land together:
--
-- 1. Columns for reading questions. The College Board bank (200 SAT "Hard"
--    items, server/assets/sat-cb-hard.json) has a passage, often a chart, and a
--    separate stem. prompt keeps the stem, so the 440 set is untouched.
--
-- 2. user_quiz_sessions. The daily streak counts "finished one Study-now quiz",
--    and until now finishing a quiz left no row behind: /api/quiz/submit only
--    updated per-word progress. One row per finished quiz.
--
-- 3. seed_steps. seed.js skips entirely once notebooks exist, so a NEW importer
--    could only reach production through FORCE_SEED=true - which re-runs every
--    importer and overwrote hand-edited meanings. Steps are now recorded, and a
--    step marked runOnce runs by itself on an already-seeded database.

ALTER TABLE questions ADD COLUMN IF NOT EXISTS passage TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS figure_url VARCHAR(255);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS skill VARCHAR(60);
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_id VARCHAR(20);  -- College Board hex id

CREATE INDEX IF NOT EXISTS idx_questions_skill ON questions(skill);

-- The importer upserts on the source id, not on position: a later export may
-- list the same questions in another order, and keying on external_id would
-- then overwrite one question with another under users' existing attempts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_set_source
  ON questions(set_id, source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_quiz_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bucket VARCHAR(20),              -- 'due_now' is the one the streak counts
  word_count INTEGER,
  correct_words INTEGER,           -- words answered right on both questions
  finished_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uqs_user ON user_quiz_sessions(user_id, finished_at DESC);

CREATE TABLE IF NOT EXISTS seed_steps (
  name VARCHAR(120) PRIMARY KEY,
  ran_at TIMESTAMP DEFAULT NOW()
);
