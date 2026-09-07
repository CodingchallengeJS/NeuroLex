/**
 * Shared tag-taxonomy seeding.
 *
 * Split out of import-tags.js because of an ordering knot: import-connectives.js
 * needs the function:* tags to exist before it can tag its words, while
 * import-tags.js has to run last so it can classify every notebook that exists
 * by then - including the one connectives creates. Both call ensureTags(), so
 * whichever runs first seeds the taxonomy and the other finds it already there.
 */
const fs = require('fs');
const path = require('path');

const TAGS_FILE = path.resolve(__dirname, '../../assets/tags.json');

/** Upserts assets/tags.json and returns a Map of slug -> tag id. */
async function ensureTags(client) {
  if (!fs.existsSync(TAGS_FILE)) {
    throw new Error(`Tag taxonomy not found at ${TAGS_FILE}`);
  }
  const { tags } = JSON.parse(fs.readFileSync(TAGS_FILE, 'utf-8'));
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('No tags found in tags.json');
  }

  const bySlug = new Map();
  for (const t of tags) {
    const r = await client.query(
      `INSERT INTO tags (slug, label, kind, scope, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         label = EXCLUDED.label,
         kind = EXCLUDED.kind,
         scope = EXCLUDED.scope,
         description = COALESCE(EXCLUDED.description, tags.description)
       RETURNING id`,
      [t.slug, t.label, t.kind, t.scope || 'both', t.description || null]
    );
    bySlug.set(t.slug, r.rows[0].id);
  }
  return bySlug;
}

module.exports = { ensureTags, TAGS_FILE };
