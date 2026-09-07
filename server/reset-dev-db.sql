-- reset-dev-db.sql
--
-- ============================ DESTRUCTIVE =============================
-- This DROPS the entire public schema and everything in it: every user,
-- every word, every bit of review progress. There is no undo.
--
-- It is NOT how you set up a database. Use `npm run migrate` for that -
-- migrations are additive and safe to run on a database with real data.
--
-- Only reach for this when you deliberately want a clean local database:
--   psql -U <user> -d <db> -f server/reset-dev-db.sql && npm run db:setup
-- ======================================================================

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
  english_meaning TEXT,
  vietnamese_meaning TEXT,
  synonyms TEXT,
  phonetic VARCHAR(255),
  example TEXT,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- notebook <-> vocab relation
CREATE TABLE notebook_vocab (
  notebook_id BIGINT REFERENCES notebooks(id) ON DELETE CASCADE,
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
  sort_order INTEGER,
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

-- add_vocab_to_review(user_id, notebook_id, limit)
--
-- Queues the next N words of a notebook into the user review queue, resuming
-- from user_notebook_progress.current_word_id and wrapping around the end.
-- Used by other-tools/addtostudy.py.
--
-- Dumped from the live development database on 2026-09-04. It was never in
-- createdb.sql, so a database built from the repo alone did not have it.
-- Fold this into the numbered migrations when P1.4 lands.
CREATE OR REPLACE FUNCTION public.add_vocab_to_review(p_user_id bigint, p_notebook_id bigint, p_limit integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    WITH OrderedVocab AS (
        SELECT
            vocab_id,
            ROW_NUMBER() OVER (ORDER BY sort_order ASC, vocab_id ASC) - 1 AS rn
        FROM notebook_vocab
        WHERE notebook_id = p_notebook_id
    ),
    CurrentPos AS (
        SELECT COALESCE(
            (SELECT ov.rn
             FROM user_notebook_progress unp
             JOIN OrderedVocab ov ON unp.current_word_id = ov.vocab_id
             WHERE unp.user_id = p_user_id AND unp.notebook_id = p_notebook_id),
            -1
        ) AS curr_rn,
        (SELECT COUNT(*) FROM OrderedVocab) AS total_words
    ),
    NextWords AS (
        SELECT
            ov.vocab_id,
            ov.rn,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN ov.rn > cp.curr_rn THEN 0 ELSE 1 END ASC,
                    ov.rn ASC
            ) AS fetch_order
        FROM OrderedVocab ov
        CROSS JOIN CurrentPos cp
        WHERE cp.total_words > 0
        ORDER BY
            CASE WHEN ov.rn > cp.curr_rn THEN 0 ELSE 1 END ASC,
            ov.rn ASC
        LIMIT p_limit
    ),
    UpdateVocabProgress AS (
        INSERT INTO user_vocab_progress (user_id, vocab_id, next_review_at, repetition_level)
        SELECT
            p_user_id,
            vocab_id,
            CURRENT_TIMESTAMP,
	    -1
        FROM NextWords
        ON CONFLICT (user_id, vocab_id) DO NOTHING
        RETURNING vocab_id
    ),
    LastWord AS (
        SELECT vocab_id
        FROM NextWords
        ORDER BY fetch_order DESC
        LIMIT 1
    )
    INSERT INTO user_notebook_progress (user_id, notebook_id, current_word_id)
    SELECT
        p_user_id,
        p_notebook_id,
        (SELECT vocab_id FROM LastWord)
    ON CONFLICT (user_id, notebook_id)
    DO UPDATE SET current_word_id = EXCLUDED.current_word_id;
END;
$function$;
