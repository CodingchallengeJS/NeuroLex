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
 * Names a notebook may still carry on a database seeded before P2 renamed
 * things. seed.js skips entirely when notebooks already exist, so a deployment
 * from before the rename never ran import-tags.js: its notebooks are still
 * called "Ielts Hard 2" with slug NULL.
 *
 * Without this, upsertNotebook would find neither the slug nor the canonical
 * title, insert a SECOND notebook under the new name, and import-tags.js would
 * then fail renaming the old one onto a title that now exists.
 */
function legacyTitles(title) {
  const out = [title];
  let m;
  if ((m = title.match(/^IELTS Magoosh — (.+)$/))) out.push(`Ielts ${m[1]}`);
  if ((m = title.match(/^SAT B2-C1 1000 — Part (\d+)$/))) out.push(`SAT B2C1 1000 P${m[1]}`);
  if ((m = title.match(/^Cambridge IELTS Advanced — Unit (\d+): (.+)$/))) {
    out.push(`vocab4ielt-${Number(m[1])} ${m[2]}`);
  }
  return [...new Set(out)];
}

/**
 * Finds or creates a built-in (owner_user_id IS NULL) notebook and returns its id.
 * Adopts a pre-slug row by title (canonical or legacy) and stamps the slug on it,
 * rather than creating a duplicate. Renaming itself stays with import-tags.js.
 */
async function upsertNotebook(client, { slug, title, topic, difficulty }) {
  if (!slug) throw new Error(`upsertNotebook needs a slug (title: ${title})`);

  const bySlug = await client.query(
    'SELECT id FROM notebooks WHERE slug = $1 AND owner_user_id IS NULL LIMIT 1',
    [slug]
  );
  if (bySlug.rowCount > 0) return bySlug.rows[0].id;

  // Pre-slug row under either its current or its old name: adopt it.
  const byTitle = await client.query(
    `SELECT id FROM notebooks
     WHERE title = ANY($1) AND owner_user_id IS NULL AND slug IS NULL
     ORDER BY id LIMIT 1`,
    [legacyTitles(title)]
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

module.exports = { slugify, upsertNotebook, legacyTitles };
