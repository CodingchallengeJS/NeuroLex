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

// SỬA ĐỔI 1: Bắt luôn cả trường hợp chữ 'null' dạng text
function cleanText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const strValue = String(value).trim();
  if (strValue.toLowerCase() === 'null') {
    return '';
  }
  return strValue;
}

function emptyToNull(value) {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeSynonyms(value) {
  let cleaned = cleanText(value);
  if (cleaned === '—' || cleaned === '-') return null;
  return cleaned;
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

// SỬA ĐỔI 2: Cập nhật SQL thông minh hơn
async function upsertVocabulary(client, item) {
  const query = `
    INSERT INTO vocabulary (word, meaning, phonetic, english_meaning, vietnamese_meaning, synonyms)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (word) DO UPDATE SET
      
      meaning = CASE 
        WHEN vocabulary.meaning IS NULL OR vocabulary.meaning IN ('', 'null') THEN EXCLUDED.meaning 
        ELSE COALESCE(EXCLUDED.meaning, vocabulary.meaning) 
      END,
      
      phonetic = CASE 
        WHEN vocabulary.phonetic IS NULL OR vocabulary.phonetic IN ('', 'null') THEN EXCLUDED.phonetic 
        ELSE COALESCE(EXCLUDED.phonetic, vocabulary.phonetic) 
      END,
      
      english_meaning = CASE 
        WHEN vocabulary.english_meaning IS NULL OR vocabulary.english_meaning IN ('', 'null') THEN EXCLUDED.english_meaning 
        ELSE COALESCE(EXCLUDED.english_meaning, vocabulary.english_meaning) 
      END,
      
      vietnamese_meaning = CASE 
        WHEN vocabulary.vietnamese_meaning IS NULL OR vocabulary.vietnamese_meaning IN ('', 'null') THEN EXCLUDED.vietnamese_meaning 
        ELSE COALESCE(EXCLUDED.vietnamese_meaning, vocabulary.vietnamese_meaning) 
      END,
      
      synonyms = CASE 
        WHEN vocabulary.synonyms IS NULL OR vocabulary.synonyms IN ('', 'null') THEN EXCLUDED.synonyms 
        ELSE COALESCE(EXCLUDED.synonyms, vocabulary.synonyms) 
      END
      
    RETURNING id;
  `;

  const result = await client.query(query, [
    item.word,
    emptyToNull(item.meaning),
    emptyToNull(item.phonetic),
    emptyToNull(item.englishMeaning),
    emptyToNull(item.vietnameseMeaning),
    emptyToNull(item.synonyms)
  ]);

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

function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, '').trim();
}

async function importMarkdown(client, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  
  const notebookTitle = 'SAT B2C1 1000 P4';
  const notebookId = await upsertNotebook(client, notebookTitle, 'SAT Vocabulary', 'B2-C1');

  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let match;
  let importedCount = 0;

  while ((match = trRegex.exec(raw)) !== null) {
    const trContent = match[1];
    
    if (trContent.includes('<th>')) continue;

    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      cells.push(tdMatch[1].trim());
    }

    if (cells.length === 6) {
      const stt = parseInt(stripHtml(cells[0]), 10);
      const word = stripHtml(cells[1]);
      const phonetic = stripHtml(cells[2]);
      const englishMeaning = stripHtml(cells[3]);
      const vietnameseMeaning = stripHtml(cells[4]);
      const synonyms = normalizeSynonyms(stripHtml(cells[5]));

      if (!word) continue;

      const vocabId = await upsertVocabulary(client, {
        word,
        meaning: vietnameseMeaning || englishMeaning,
        phonetic,
        englishMeaning,
        vietnameseMeaning,
        synonyms
      });

      await linkVocabularyToNotebook(client, notebookId, vocabId, isNaN(stt) ? (importedCount + 1) : stt);
      importedCount += 1;
    }
  }

  return importedCount;
}

async function main() {
  const mdFile = path.resolve(__dirname, '../assets/va-b2c1-1000-part4.md');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS english_meaning TEXT');
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS vietnamese_meaning TEXT');
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS synonyms TEXT');
    await client.query('ALTER TABLE notebook_vocab ADD COLUMN IF NOT EXISTS sort_order INTEGER');

    const importedCount = await importMarkdown(client, mdFile);

    await client.query('COMMIT');
    console.log(`✅ Cập nhật thành công. Đã import/update ${importedCount} từ cho notebook SAT B2C1 1000 P1.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Có lỗi xảy ra, đã rollback DB:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();