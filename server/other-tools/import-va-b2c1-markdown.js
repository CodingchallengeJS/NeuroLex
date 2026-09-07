const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');
const { upsertNotebook } = require('./lib/notebooks');

const pool = createPool();

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

async function importMarkdown(client, filePath, notebookTitle, notebookSlug) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf-8');

  const notebookId = await upsertNotebook(client, {
    slug: notebookSlug,
    title: notebookTitle,
    topic: 'SAT Vocabulary',
    difficulty: 'B2-C1'
  });

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
  // Which part to import: `node import_vocab3.js 2` -> va-b2c1-1000-part2.md
  const part = Number.parseInt(process.argv[2] || '4', 10);
  if (!Number.isInteger(part) || part < 1 || part > 4) {
    throw new Error('Part must be an integer between 1 and 4');
  }
  const mdFile = path.resolve(__dirname, `../assets/va-b2c1-1000-part${part}.md`);
  const notebookTitle = `SAT B2-C1 1000 — Part ${part}`;
  const notebookSlug = `sat-b2c1-1000-part-${part}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Schema is owned by server/migrations/ - run `npm run migrate` first.

    const importedCount = await importMarkdown(client, mdFile, notebookTitle, notebookSlug);

    await client.query('COMMIT');
    console.log(`✅ Cập nhật thành công. Đã import/update ${importedCount} từ cho notebook ${notebookTitle}.`);
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
