-- 005_tags.sql
--
-- Tags replace the overloaded `topic` / `difficulty` columns.
--
-- Two scopes, because the two things being described are different:
--   notebook tags - "this collection is SAT vocabulary about health"
--   word tags     - "corroborate is a substantiation verb"
--
-- A word tag cannot be derived from its notebooks: `refute` and `undermine`
-- each sit in 3 notebooks spanning both IELTS and SAT, 688 words are in more
-- than one notebook, and 73 are in none at all.

CREATE TABLE IF NOT EXISTS tags (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,           -- 'exam:sat', 'function:dispute'
  label VARCHAR(100) NOT NULL,                -- display name; admin can rename
  kind VARCHAR(20) NOT NULL,                  -- exam|source|topic|level|function|register
  scope VARCHAR(10) NOT NULL DEFAULT 'both',  -- notebook|word|both
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT tags_scope_check CHECK (scope IN ('notebook', 'word', 'both'))
);

-- ON DELETE CASCADE on both join tables is what makes "admin deletes a tag"
-- safe: the tag's links disappear, the notebooks and words do not.
CREATE TABLE IF NOT EXISTS notebook_tags (
  notebook_id BIGINT REFERENCES notebooks(id) ON DELETE CASCADE,
  tag_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (notebook_id, tag_id)
);

CREATE TABLE IF NOT EXISTS vocab_tags (
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
  tag_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (vocab_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_notebook_tags_tag ON notebook_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_vocab_tags_tag ON vocab_tags(tag_id);

-- Display names become renameable, so URLs need something stable to hang on.
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS description TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_slug_global
  ON notebooks (slug) WHERE owner_user_id IS NULL AND slug IS NOT NULL;

-- `topic` and `difficulty` stay for now: import-tags.js reads them to backfill.
-- Dropping them is a later cleanup, once nothing in the UI references them.
