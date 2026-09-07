-- 003_ownership_and_id_types.sql
--
-- Two fixes needed before this runs anywhere with more than one user.

-- 1. user_notebook_progress used INTEGER while users.id and notebooks.id are
--    BIGSERIAL. The foreign keys still worked, but the columns would overflow
--    long before the tables they point at do.
ALTER TABLE user_notebook_progress
  ALTER COLUMN user_id TYPE BIGINT,
  ALTER COLUMN notebook_id TYPE BIGINT,
  ALTER COLUMN current_word_id TYPE BIGINT;

-- 2. Notebooks had no owner, so anything a user created (including the "Chunk"
--    review notebook the app generates) was global and shared by everyone:
--    one user's Chunk overwrote another's.
--    NULL owner = a built-in notebook from the seed, visible to all.
ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notebooks_owner ON notebooks(owner_user_id);

-- notebooks.title is globally UNIQUE, which stops two users from each having a
-- notebook called "Chunk". Ownership is what makes a title unique now.
ALTER TABLE notebooks DROP CONSTRAINT IF EXISTS notebooks_title_key;

-- One index per case, because UNIQUE treats NULLs as distinct and would let the
-- seed create duplicate built-in titles.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_title_global
  ON notebooks (title) WHERE owner_user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_title_per_owner
  ON notebooks (owner_user_id, title) WHERE owner_user_id IS NOT NULL;
