const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

function cleanText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function emptyToNull(value) {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

async function upsertNotebook(client, title, topic, difficulty) {
  await client.query(
    `INSERT INTO notebooks (title, topic, difficulty)
     VALUES ($1,$2,$3)
     ON CONFLICT (title) DO NOTHING`,
    [title, topic, difficulty]
  );

  const notebookRes = await client.query('SELECT id FROM notebooks WHERE title = $1 LIMIT 1', [title]);
  return notebookRes.rows[0].id;
}

async function upsertVocabulary(client, item) {
  const result = await client.query(
    `INSERT INTO vocabulary (word, meaning, english_meaning, vietnamese_meaning)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (word) DO UPDATE SET
       meaning = COALESCE(EXCLUDED.meaning, vocabulary.meaning),
       english_meaning = COALESCE(EXCLUDED.english_meaning, vocabulary.english_meaning),
       vietnamese_meaning = COALESCE(EXCLUDED.vietnamese_meaning, vocabulary.vietnamese_meaning)
     RETURNING id`,
    [
      item.word,
      emptyToNull(item.meaning),
      emptyToNull(item.englishMeaning),
      emptyToNull(item.vietnameseMeaning)
    ]
  );

  return result.rows[0].id;
}

async function linkVocabularyToNotebook(client, notebookId, vocabId, sortOrder = null) {
  await client.query(
    `INSERT INTO notebook_vocab (notebook_id, vocab_id, sort_order)
     VALUES ($1,$2,$3)
     ON CONFLICT (notebook_id, vocab_id)
     DO UPDATE SET sort_order = COALESCE(EXCLUDED.sort_order, notebook_vocab.sort_order)`,
    [notebookId, vocabId, sortOrder]
  );
}

function formatTitle(filename) {
  // ielts-common-1.json -> Ielts Common 1
  const basename = path.basename(filename, '.json');
  return basename.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function importMagoosh(client, dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found at ${dirPath}`);
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  let totalImported = 0;

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(raw);
    
    const notebookTitle = formatTitle(file);
    console.log(`Importing notebook: ${notebookTitle}`);
    const notebookId = await upsertNotebook(client, notebookTitle, 'IELTS Magoosh', 'mixed');

    let index = 1;
    let fileImported = 0;
    
    for (const word of Object.keys(data)) {
      const info = data[word];
      const meanings = Array.isArray(info.meanings) ? info.meanings.join('; ') : '';
      
      const vocabId = await upsertVocabulary(client, {
        word: cleanText(word),
        meaning: meanings,
        englishMeaning: meanings,
        vietnameseMeaning: '' // No Vietnamese meaning in Magoosh source
      });

      await linkVocabularyToNotebook(client, notebookId, vocabId, index);
      
      index += 1;
      fileImported += 1;
      totalImported += 1;
    }
    console.log(`- Imported ${fileImported} words for ${notebookTitle}`);
  }

  return totalImported;
}

async function main() {
  const magooshDir = path.resolve(__dirname, 'magoosh');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Make sure tables are there
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS english_meaning TEXT');
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS vietnamese_meaning TEXT');
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS synonyms TEXT');
    await client.query('ALTER TABLE notebook_vocab ADD COLUMN IF NOT EXISTS sort_order INTEGER');

    const importedCount = await importMagoosh(client, magooshDir);

    await client.query('COMMIT');
    console.log(`Magoosh import finished. Total words: ${importedCount}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
