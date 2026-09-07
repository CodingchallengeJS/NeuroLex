-- 004_user_is_admin.sql
--
-- Editing a word in `vocabulary` changes it for every user, so it is restricted
-- to the maintainer. That check used to be `user_id !== 1`, which is really
-- "whoever registered first". That is fine on a laptop where you are user 1,
-- but on a fresh deployment the first stranger to sign up would inherit it.
--
-- Make it an explicit flag instead of an accident of registration order.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Preserve current behaviour on databases that already exist: user 1 was the
-- maintainer, so keep that. A brand new database has no users yet and this
-- matches nothing - there, ADMIN_EMAIL grants the flag at registration.
UPDATE users SET is_admin = TRUE WHERE id = 1;
