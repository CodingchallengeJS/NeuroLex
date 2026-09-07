/**
 * Creates the "Linking Words & Discourse Markers" notebook from
 * assets/connectives.json and tags each word by its rhetorical function.
 *
 * These words are missing from the vocabulary table because the SAT/IELTS
 * source lists only carry advanced words - yet `however`, `albeit` and
 * `by no means` are exactly what holds an argument together in Writing Task 2.
 *
 * Runs BEFORE import-tags.js in the seed, so that the notebook exists by the
 * time notebooks get classified. It seeds the tag taxonomy itself (via the
 * shared ensureTags) rather than depending on import-tags.js having run.
 *
 * A handful of entries (nevertheless, although, significantly, ...) already
 * exist in the vocabulary table with good meanings. Those are linked and tagged
 * WITHOUT overwriting what is already there.
 */
const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');
const { upsertNotebook } = require('./lib/notebooks');
const { ensureTags } = require('./lib/tags');

const pool = createPool();
const DATA_FILE = path.resolve(__dirname, '../assets/connectives.json');

function emptyToNull(value) {
  const v = (value === null || value === undefined) ? '' : String(value).trim();
  return v.length > 0 && v.toLowerCase() !== 'null' ? v : null;
}

/**
 * Insert, or fill in only the fields the existing row is missing. An existing
 * meaning written by a human beats one from this seed file.
 */
async function upsertVocabulary(client, item) {
  const res = await client.query(
    `INSERT INTO vocabulary (word, meaning, english_meaning, vietnamese_meaning, synonyms, phonetic, example)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (word) DO UPDATE SET
       meaning = CASE
         WHEN vocabulary.meaning IS NULL OR vocabulary.meaning IN ('', 'null')
         THEN EXCLUDED.meaning ELSE vocabulary.meaning END,
       english_meaning = CASE
         WHEN vocabulary.english_meaning IS NULL OR vocabulary.english_meaning IN ('', 'null')
         THEN EXCLUDED.english_meaning ELSE vocabulary.english_meaning END,
       vietnamese_meaning = CASE
         WHEN vocabulary.vietnamese_meaning IS NULL OR vocabulary.vietnamese_meaning IN ('', 'null')
         THEN EXCLUDED.vietnamese_meaning ELSE vocabulary.vietnamese_meaning END,
       synonyms = CASE
         WHEN vocabulary.synonyms IS NULL OR vocabulary.synonyms IN ('', 'null')
         THEN EXCLUDED.synonyms ELSE vocabulary.synonyms END,
       phonetic = CASE
         WHEN vocabulary.phonetic IS NULL OR vocabulary.phonetic IN ('', 'null')
         THEN EXCLUDED.phonetic ELSE vocabulary.phonetic END,
       example = CASE
         WHEN vocabulary.example IS NULL OR vocabulary.example IN ('', 'null')
         THEN EXCLUDED.example ELSE vocabulary.example END
     RETURNING id, (xmax = 0) AS inserted`,
    [
      item.word.trim(),
      emptyToNull(item.english_meaning),
      emptyToNull(item.english_meaning),
      emptyToNull(item.vietnamese_meaning),
      emptyToNull(item.synonyms),
      emptyToNull(item.phonetic),
      emptyToNull(item.example)
    ]
  );
  return res.rows[0];
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Connectives data not found at ${DATA_FILE}`);
  }
  const { notebook, words } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('No words found in connectives.json');
  }

  const client = await pool.connect();
  let created = 0;
  let existing = 0;
  let tagLinks = 0;
  const missingTags = new Set();

  try {
    await client.query('BEGIN');

    const notebookId = await upsertNotebook(client, {
      slug: notebook.slug,
      title: notebook.title,
      topic: notebook.topic,
      difficulty: notebook.difficulty
    });

    // Seed the taxonomy if this runs before import-tags.js, and get slug -> id.
    const tagIds = await ensureTags(client);

    let sortOrder = 1;
    for (const item of words) {
      const { id: vocabId, inserted } = await upsertVocabulary(client, item);
      if (inserted) created += 1; else existing += 1;

      await client.query(
        `INSERT INTO notebook_vocab (notebook_id, vocab_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (notebook_id, vocab_id)
         DO UPDATE SET sort_order = COALESCE(EXCLUDED.sort_order, notebook_vocab.sort_order)`,
        [notebookId, vocabId, sortOrder]
      );
      sortOrder += 1;

      for (const slug of item.tags || []) {
        const tagId = tagIds.get(slug);
        if (!tagId) { missingTags.add(slug); continue; }
        await client.query(
          'INSERT INTO vocab_tags (vocab_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [vocabId, tagId]
        );
        tagLinks += 1;
      }
    }

    if (missingTags.size > 0) {
      throw new Error(
        `Unknown tag(s): ${[...missingTags].join(', ')}. Run import-tags.js first.`
      );
    }

    await client.query('COMMIT');
    console.log(`✅ ${notebook.title}: ${words.length} words ` +
                `(${created} new, ${existing} already in vocabulary), ${tagLinks} tag links.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Có lỗi xảy ra, đã rollback DB:', err.message);
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
