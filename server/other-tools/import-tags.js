/**
 * Seeds the tag taxonomy from assets/tags.json, then classifies the built-in
 * notebooks: canonical title, stable slug, and tags.
 *
 * Runs LAST in seed.js, after every notebook exists.
 *
 * Renaming lives here rather than in the individual importers so there is one
 * place that decides what a notebook is called. The importers create notebooks
 * with their canonical names already; this pass fixes up databases seeded
 * before P2 and is a no-op on ones seeded after.
 *
 * Idempotent: re-running re-applies the same names, slugs and tags.
 */
const { createPool } = require('../db');
const { slugify } = require('./lib/notebooks');
const { ensureTags } = require('./lib/tags');

const pool = createPool();

/* ------------------------------------------------------------------ *
 * Notebook classification
 * ------------------------------------------------------------------ */

// Topic notebooks from vocabularies.json. Titles are already clean; they only
// need a slug and tags. Classic IELTS essay topics, hence exam:ielts.
const TOPIC_NOTEBOOKS = {
  'Urbanization & Migration': ['topic:urbanization'],
  'Health & Lifestyle': ['topic:health'],
  'Education': ['topic:education'],
  'Environment & Climate Change': ['topic:environment'],
  'Technology & Society': ['topic:technology'],
  'Government & Society': ['topic:society'],
  'Psychology & Behavior': ['topic:psychology']
};

/**
 * Returns { title, slug, tags } for a built-in notebook, or null to leave it
 * alone (user-created lists, the runtime "Chunk" notebook).
 * Matches both the legacy title and the canonical one so it is idempotent.
 */
function classify(title) {
  let m;

  // "Ielts Very Hard 1" (legacy) / "IELTS Magoosh — Very Hard 1" (canonical)
  m = title.match(/^Ielts (.+)$/) || title.match(/^IELTS Magoosh — (.+)$/);
  if (m) {
    return {
      title: `IELTS Magoosh — ${m[1]}`,
      slug: `ielts-magoosh-${slugify(m[1])}`,
      tags: ['exam:ielts', 'source:magoosh']
    };
  }

  // "SAT B2C1 1000 P4" (legacy) / "SAT B2-C1 1000 — Part 4" (canonical)
  m = title.match(/^SAT B2C1 1000 P(\d+)$/) || title.match(/^SAT B2-C1 1000 — Part (\d+)$/);
  if (m) {
    return {
      title: `SAT B2-C1 1000 — Part ${m[1]}`,
      slug: `sat-b2c1-1000-part-${m[1]}`,
      tags: ['exam:sat', 'level:b2-c1']
    };
  }

  // "vocab4ielt-1 Human nature" / "Cambridge IELTS Advanced — Unit 01: Human nature"
  m = title.match(/^vocab4ielt-(\d+)\s+(.+)$/)
    || title.match(/^Cambridge IELTS Advanced — Unit (\d+): (.+)$/);
  if (m) {
    const unit = String(Number(m[1])).padStart(2, '0');
    return {
      title: `Cambridge IELTS Advanced — Unit ${unit}: ${m[2]}`,
      slug: `cambridge-ielts-advanced-unit-${unit}`,
      tags: ['exam:ielts', 'source:cambridge', 'level:advanced']
    };
  }

  if (title === 'SAT C1-C2 500 (2023-2026)') {
    return { title, slug: 'sat-c1c2-500-2023-2026', tags: ['exam:sat', 'level:c1-c2'] };
  }

  if (title === 'Cambridge IELTS Advanced') {
    return {
      title,
      slug: 'cambridge-ielts-advanced',
      tags: ['exam:ielts', 'source:cambridge', 'level:advanced']
    };
  }

  if (title === 'Linking Words & Discourse Markers') {
    return {
      title,
      slug: 'linking-words-discourse-markers',
      tags: ['topic:society', 'level:b2-c1']
    };
  }

  if (Object.prototype.hasOwnProperty.call(TOPIC_NOTEBOOKS, title)) {
    return {
      title,
      slug: `topic-${slugify(title)}`,
      tags: [...TOPIC_NOTEBOOKS[title], 'exam:ielts', 'level:b2-c1']
    };
  }

  return null; // "Chunk", "My notebook", anything a user made
}

/* ------------------------------------------------------------------ *
 * Import
 * ------------------------------------------------------------------ */

async function main() {
  const client = await pool.connect();
  const renamed = [];
  let tagged = 0;
  let skipped = 0;

  try {
    await client.query('BEGIN');

    const tagIds = await ensureTags(client);
    console.log(`Tags in taxonomy: ${tagIds.size}`);

    // The old generate-vocab4ielts-sql.js fallback notebook. It is always empty
    // (a data-modifying CTE was invisible to the CTE that read it), so nothing
    // is lost by removing it, and the current seed never creates it.
    const dropped = await client.query(
      `DELETE FROM notebooks
       WHERE title = 'vocab4ielts-other'
         AND owner_user_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM notebook_vocab WHERE notebook_id = notebooks.id)`
    );
    if (dropped.rowCount > 0) console.log('Removed the empty vocab4ielts-other notebook');

    const notebooks = await client.query(
      'SELECT id, title, slug FROM notebooks WHERE owner_user_id IS NULL ORDER BY id'
    );

    for (const nb of notebooks.rows) {
      const plan = classify(nb.title);
      if (!plan) {
        skipped += 1;
        continue;
      }

      if (plan.title !== nb.title || plan.slug !== nb.slug) {
        await client.query('UPDATE notebooks SET title = $1, slug = $2 WHERE id = $3', [
          plan.title, plan.slug, nb.id
        ]);
        if (plan.title !== nb.title) renamed.push(`${nb.title}  ->  ${plan.title}`);
      }

      for (const slug of plan.tags) {
        const tagId = tagIds.get(slug);
        if (!tagId) throw new Error(`Notebook "${plan.title}" wants unknown tag "${slug}"`);
        await client.query(
          `INSERT INTO notebook_tags (notebook_id, tag_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [nb.id, tagId]
        );
      }
      tagged += 1;
    }

    await client.query('COMMIT');

    if (renamed.length > 0) {
      console.log(`\nRenamed ${renamed.length} notebook(s):`);
      renamed.forEach((line) => console.log(`  ${line}`));
    }
    console.log(`\n✅ Tagged ${tagged} notebook(s); left ${skipped} untouched (user-created).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Có lỗi xảy ra, đã rollback DB:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
