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

function resolveDataPath(filePath) {
  const absoluteFromCwd = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(absoluteFromCwd)) {
    return absoluteFromCwd;
  }
  return path.resolve(__dirname, filePath);
}

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

function normalizeSynonyms(value) {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(', ');
  }
  return cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers) {
    return [];
  }

  return records
    .filter((record) => record.some((cell) => cleanText(cell).length > 0))
    .map((record) =>
      headers.reduce((acc, header, index) => {
        acc[cleanText(header)] = cleanText(record[index]);
        return acc;
      }, {})
    );
}

async function ensureVocabularyDetailColumns(client) {
  await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS english_meaning TEXT');
  await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS vietnamese_meaning TEXT');
  await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS synonyms TEXT');
  await client.query('ALTER TABLE notebook_vocab ADD COLUMN IF NOT EXISTS sort_order INTEGER');
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
    `INSERT INTO vocabulary (word, meaning, phonetic, english_meaning, vietnamese_meaning, synonyms)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (word) DO UPDATE SET
       meaning = COALESCE(EXCLUDED.meaning, vocabulary.meaning),
       phonetic = COALESCE(EXCLUDED.phonetic, vocabulary.phonetic),
       english_meaning = COALESCE(EXCLUDED.english_meaning, vocabulary.english_meaning),
       vietnamese_meaning = COALESCE(EXCLUDED.vietnamese_meaning, vocabulary.vietnamese_meaning),
       synonyms = COALESCE(EXCLUDED.synonyms, vocabulary.synonyms)
     RETURNING id`,
    [
      item.word,
      emptyToNull(item.meaning),
      emptyToNull(item.phonetic),
      emptyToNull(item.englishMeaning),
      emptyToNull(item.vietnameseMeaning),
      emptyToNull(item.synonyms)
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

async function importJsonVocab(client, file) {
  if (!fs.existsSync(file)) {
    throw new Error(`vocabularies.json not found at ${file}`);
  }

  const raw = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(raw);
  let importedCount = 0;

  for (const topic of Object.keys(data)) {
    const notebookId = await upsertNotebook(client, topic, topic, 'medium');
    const words = data[topic];

    const wordList = Object.keys(words);
    for (let index = 0; index < wordList.length; index += 1) {
      const word = wordList[index];
      const info = words[word];
      const meaning = cleanText(info.meaning);
      const vocabId = await upsertVocabulary(client, {
        word: cleanText(word),
        meaning,
        phonetic: info.pronunciation || info.phonetic || '',
        englishMeaning: info.english_meaning || info.englishMeaning || '',
        vietnameseMeaning: info.vietnamese_meaning || info.vietnameseMeaning || meaning,
        synonyms: normalizeSynonyms(info.synonyms)
      });

      await linkVocabularyToNotebook(client, notebookId, vocabId, index + 1);
      importedCount += 1;
    }
  }

  return importedCount;
}

async function importSatCsv(client, file) {
  if (!fs.existsSync(file)) {
    console.warn('SAT CSV not found at', file, '- skipping SAT import.');
    return 0;
  }

  const raw = fs.readFileSync(file, 'utf-8');
  const rows = parseCsv(raw);
  const notebookId = await upsertNotebook(client, 'SAT C1-C2 500 (2023-2026)', 'SAT Vocabulary', 'C1-C2');
  let importedCount = 0;

  for (const row of rows) {
    const word = cleanText(row.word);
    if (!word) {
      continue;
    }

    const englishMeaning = cleanText(row.english_meaning);
    const vietnameseMeaning = cleanText(row.vietnamese_meaning);
    const csvRank = Number.parseInt(row.id, 10);
    const vocabId = await upsertVocabulary(client, {
      word,
      meaning: vietnameseMeaning || englishMeaning,
      phonetic: row.pronounciation || row.pronunciation || row.phonetic || '',
      englishMeaning,
      vietnameseMeaning,
      synonyms: normalizeSynonyms(row.synonyms)
    });

    await linkVocabularyToNotebook(
      client,
      notebookId,
      vocabId,
      Number.isInteger(csvRank) ? csvRank : importedCount + 1
    );
    importedCount += 1;
  }

  return importedCount;
}

async function main() {
  const jsonFile = resolveDataPath(process.env.VOCAB_FILE || 'vocabularies.json');
  const satCsvFile = resolveDataPath(process.env.SAT_VOCAB_FILE || 'va-c1c2-500-2023-2026.csv');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureVocabularyDetailColumns(client);

    const jsonCount = await importJsonVocab(client, jsonFile);
    const satCount = await importSatCsv(client, satCsvFile);

    await client.query('COMMIT');
    console.log(`Import finished. JSON words: ${jsonCount}. SAT CSV words: ${satCount}.`);
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
