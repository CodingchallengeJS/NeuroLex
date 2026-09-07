/**
 * Applies the word-level function tags in assets/vocab-tags.json.
 *
 * Runs after import-tags.js (which creates the tags themselves) and after every
 * vocabulary importer. A word listed here that is not in the vocabulary table
 * is reported, never auto-created - the point of this file is to classify words
 * that already exist, and a silent insert would hide a typo.
 *
 * Idempotent: ON CONFLICT DO NOTHING on the join table.
 */
const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');

const pool = createPool();
const DATA_FILE = path.resolve(__dirname, '../assets/vocab-tags.json');

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Word tag data not found at ${DATA_FILE}`);
  }
  const { tags } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!tags || typeof tags !== 'object') {
    throw new Error('vocab-tags.json has no "tags" object');
  }

  const client = await pool.connect();
  const missingWords = [];
  const perTag = [];
  let linked = 0;

  try {
    await client.query('BEGIN');

    for (const [tagSlug, words] of Object.entries(tags)) {
      const tagRes = await client.query('SELECT id FROM tags WHERE slug = $1 LIMIT 1', [tagSlug]);
      if (tagRes.rowCount === 0) {
        throw new Error(`Tag "${tagSlug}" does not exist. Run import-tags.js first.`);
      }
      const tagId = tagRes.rows[0].id;

      let applied = 0;
      for (const word of words) {
        const v = await client.query(
          'SELECT id FROM vocabulary WHERE LOWER(word) = LOWER($1) LIMIT 1',
          [word]
        );
        if (v.rowCount === 0) {
          missingWords.push(`${word} (${tagSlug})`);
          continue;
        }
        await client.query(
          'INSERT INTO vocab_tags (vocab_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [v.rows[0].id, tagId]
        );
        applied += 1;
        linked += 1;
      }
      perTag.push({ tagSlug, applied, listed: words.length });
    }

    await client.query('COMMIT');

    console.log('Word tags applied:');
    perTag.forEach((t) => {
      console.log(`  ${t.tagSlug.padEnd(24)} ${String(t.applied).padStart(3)} / ${t.listed} listed`);
    });
    console.log(`\n✅ ${linked} word-tag links across ${perTag.length} tags.`);

    if (missingWords.length > 0) {
      console.log(
        `\n⚠️  ${missingWords.length} listed word(s) are not in the vocabulary table ` +
        `and were skipped:\n   ${missingWords.join(', ')}`
      );
    }
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
