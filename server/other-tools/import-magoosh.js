const fs = require('fs');
const path = require('path');
const { createPool } = require('../db');
const { upsertNotebook, slugify } = require('./lib/notebooks');

const pool = createPool();

// SỬA ĐỔI 1: Bắt luôn cả trường hợp chữ 'null' text ngay từ khi làm sạch chữ
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


// SỬA ĐỔI 2: Cập nhật SQL thông minh, bắt buộc ghi đè nếu DB đang chứa NULL, 'null' hoặc rỗng
async function upsertVocabulary(client, item) {
  const query = `
    INSERT INTO vocabulary (word, meaning, english_meaning, vietnamese_meaning)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (word) DO UPDATE SET
       
       meaning = CASE 
         WHEN vocabulary.meaning IS NULL OR vocabulary.meaning IN ('', 'null') THEN EXCLUDED.meaning 
         ELSE COALESCE(EXCLUDED.meaning, vocabulary.meaning) 
       END,
       
       english_meaning = CASE 
         WHEN vocabulary.english_meaning IS NULL OR vocabulary.english_meaning IN ('', 'null') THEN EXCLUDED.english_meaning 
         ELSE COALESCE(EXCLUDED.english_meaning, vocabulary.english_meaning) 
       END,
       
       vietnamese_meaning = CASE 
         WHEN vocabulary.vietnamese_meaning IS NULL OR vocabulary.vietnamese_meaning IN ('', 'null') THEN EXCLUDED.vietnamese_meaning 
         ELSE COALESCE(EXCLUDED.vietnamese_meaning, vocabulary.vietnamese_meaning) 
       END

    RETURNING id;
  `;

  const result = await client.query(query, [
    item.word,
    emptyToNull(item.meaning),
    emptyToNull(item.englishMeaning),
    emptyToNull(item.vietnameseMeaning)
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

// ielts-very-hard-1.json -> "Very Hard 1" (the part after the IELTS prefix)
function formatVariant(filename) {
  return path.basename(filename, '.json')
    .replace(/^ielts-/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
    
    const variant = formatVariant(file);
    const notebookTitle = `IELTS Magoosh — ${variant}`;
    console.log(`Importing notebook: ${notebookTitle}`);
    const notebookId = await upsertNotebook(client, {
      slug: `ielts-magoosh-${slugify(variant)}`,
      title: notebookTitle,
      topic: 'IELTS Magoosh',
      difficulty: 'mixed'
    });

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
  const magooshDir = path.resolve(__dirname, '../assets/magoosh');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Schema is owned by server/migrations/ - run `npm run migrate` first.

    const importedCount = await importMagoosh(client, magooshDir);

    await client.query('COMMIT');
    console.log(`✅ Magoosh import finished. Total words: ${importedCount}.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during import, DB rolled back:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();