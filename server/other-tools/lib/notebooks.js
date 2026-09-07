/**
 * Shared notebook upsert for the seed importers.
 *
 * Titles are display text and P2 renames them ("Ielts Hard 2" ->
 * "IELTS Magoosh — Hard 2"). Looking a notebook up by title alone would
 * therefore make a re-run create a duplicate under the old name. `slug` is the
 * stable identity: match on it first, fall back to title for rows created
 * before slugs existed, and adopt them by writing the slug in.
 */

function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Finds or creates a built-in (owner_user_id IS NULL) notebook and returns its id.
 * Never renames an existing notebook - import-tags.js owns renaming.
 */
async function upsertNotebook(client, { slug, title, topic, difficulty }) {
  if (!slug) throw new Error(`upsertNotebook needs a slug (title: ${title})`);

  const bySlug = await client.query(
    'SELECT id FROM notebooks WHERE slug = $1 AND owner_user_id IS NULL LIMIT 1',
    [slug]
  );
  if (bySlug.rowCount > 0) return bySlug.rows[0].id;

  // Pre-slug row, or one this importer created before: adopt it.
  const byTitle = await client.query(
    'SELECT id FROM notebooks WHERE title = $1 AND owner_user_id IS NULL LIMIT 1',
    [title]
  );
  if (byTitle.rowCount > 0) {
    await client.query('UPDATE notebooks SET slug = $1 WHERE id = $2', [slug, byTitle.rows[0].id]);
    return byTitle.rows[0].id;
  }

  await client.query(
    `INSERT INTO notebooks (title, topic, difficulty, slug)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (title) WHERE owner_user_id IS NULL DO NOTHING`,
    [title, topic, difficulty, slug]
  );

  const created = await client.query(
    'SELECT id FROM notebooks WHERE title = $1 AND owner_user_id IS NULL LIMIT 1',
    [title]
  );
  return created.rows[0].id;
}

module.exports = { slugify, upsertNotebook };
