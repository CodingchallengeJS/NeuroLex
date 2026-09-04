/**
 * Creates the 20 "Cambridge Vocabulary for IELTS Advanced" unit notebooks from
 * assets/vocab4ielts-units.json.
 *
 * These units re-categorise words that import-cleaned-csv.js already loads, so
 * run that importer first. A word that is still missing from the vocabulary
 * table is created with just its spelling and reported at the end, so it can be
 * given a meaning later instead of disappearing silently.
 *
 * Replaces the old generate-SQL-then-run-psql flow of
 * generate-vocab4ielts-sql.js (kept in this folder for reference).
 */
const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');

const pool = createPool();

const DATA_FILE = path.resolve(__dirname, '../assets/vocab4ielts-units.json');

async function upsertNotebook(client, title, topic, difficulty) {
  await client.query(
    `INSERT INTO notebooks (title, topic, difficulty)
     VALUES ($1, $2, $3)
     ON CONFLICT (title) DO NOTHING`,
    [title, topic, difficulty]
  );
  const res = await client.query(
    'SELECT id FROM notebooks WHERE title = $1 LIMIT 1',
    [title]
  );
  return res.rows[0].id;
}

// Look the word up case-insensitively; only create it when genuinely absent.
async function resolveVocabId(client, word) {
  const found = await client.query(
    'SELECT id FROM vocabulary WHERE LOWER(word) = LOWER($1) LIMIT 1',
    [word]
  );
  if (found.rowCount > 0) {
    return { id: found.rows[0].id, created: false };
  }

  const inserted = await client.query(
    `INSERT INTO vocabulary (word)
     VALUES ($1)
     ON CONFLICT (word) DO UPDATE SET word = EXCLUDED.word
     RETURNING id`,
    [word]
  );
  return { id: inserted.rows[0].id, created: true };
}

async function linkVocab(client, notebookId, vocabId, sortOrder) {
  await client.query(
    `INSERT INTO notebook_vocab (notebook_id, vocab_id, sort_order)
     VALUES ($1, $2, $3)
     ON CONFLICT (notebook_id, vocab_id)
     DO UPDATE SET sort_order = COALESCE(EXCLUDED.sort_order, notebook_vocab.sort_order)`,
    [notebookId, vocabId, sortOrder]
  );
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found at ${DATA_FILE}`);
  }
  const { units } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  if (!Array.isArray(units) || units.length === 0) {
    throw new Error('No units found in vocab4ielts-units.json');
  }

  const client = await pool.connect();
  const createdWords = [];
  let linked = 0;

  try {
    await client.query('BEGIN');

    for (const unit of units) {
      const notebookId = await upsertNotebook(client, unit.title, unit.topic, 'Advanced');

      let sortOrder = 1;
      for (const word of unit.words) {
        const { id, created } = await resolveVocabId(client, word);
        if (created) createdWords.push(word);
        await linkVocab(client, notebookId, id, sortOrder);
        sortOrder += 1;
        linked += 1;
      }

      console.log(`- ${unit.title}: ${unit.words.length} words`);
    }

    await client.query('COMMIT');
    console.log(`\n✅ Imported ${units.length} notebooks, ${linked} word links.`);
    if (createdWords.length > 0) {
      console.log(
        `⚠️  ${createdWords.length} word(s) had no vocabulary entry and were created ` +
        `with no meaning: ${createdWords.join(', ')}`
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
