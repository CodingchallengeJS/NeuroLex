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

// Hàm thực thi truy vấn UPDATE
async function updateVocabularyExample(client, word, exampleText) {
  await client.query(
    `UPDATE vocabulary 
     SET example = $1 
     WHERE word = $2`,
    [emptyToNull(exampleText), cleanText(word)]
  );
}

async function importExamples(client, dirPath) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found at ${dirPath}`);
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  let totalUpdated = 0;

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(raw);
    
    console.log(`Processing examples in file: ${file}`);
    let fileUpdated = 0;
    
    for (const word of Object.keys(data)) {
      const info = data[word];
      
      // Kiểm tra và xử lý mảng examples
      if (info.examples && Array.isArray(info.examples) && info.examples.length > 0) {
        // Gộp các ví dụ bằng ký tự xuống dòng (\n) để tách biệt các ngữ cảnh khi hiển thị ở Front-end
        const examplesText = info.examples.join('\n');
        
        await updateVocabularyExample(client, word, examplesText);
        fileUpdated += 1;
        totalUpdated += 1;
      }
    }
    console.log(`- Successfully updated examples for ${fileUpdated} words in ${file}`);
  }

  return totalUpdated;
}

async function main() {
  const magooshDir = path.resolve(__dirname, 'magoosh');

  const client = await pool.connect();
  try {
    // Khởi tạo Transaction để đảm bảo tính toàn vẹn dữ liệu (Data Integrity)
    await client.query('BEGIN');
    
    // Safety check: Đảm bảo cột 'example' thực sự tồn tại trong DB trước khi thao tác
    await client.query('ALTER TABLE vocabulary ADD COLUMN IF NOT EXISTS example TEXT');
    
    const updatedCount = await importExamples(client, magooshDir);

    await client.query('COMMIT');
    console.log(`\nImport process completed successfully. Total words updated with examples: ${updatedCount}.`);
  } catch (err) {
    // Rollback nếu có bất kỳ lỗi nào xảy ra trong quá trình update
    await client.query('ROLLBACK');
    console.error('Transaction failed. Rolled back.', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();