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
  if (fs.existsSync(absoluteFromCwd)) return absoluteFromCwd;
  return path.resolve(__dirname, filePath);
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') { field += '"'; i += 1; } 
      else if (char === '"') { inQuotes = false; } 
      else { field += char; }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; } 
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; } 
    else if (char !== '\r') field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  if (!headers) return [];

  return records
    .filter((record) => record.some((cell) => cleanText(cell).length > 0))
    .map((record) =>
      headers.reduce((acc, header, index) => {
        acc[cleanText(header)] = cleanText(record[index]);
        return acc;
      }, {})
    );
}

async function fixWordFieldById(client, file) {
  if (!fs.existsSync(file)) {
    throw new Error(`[ERROR] Ko tìm thấy file SAT CSV tại: ${file}`);
  }

  const raw = fs.readFileSync(file, 'utf-8');
  const rows = parseCsv(raw);
  
  // 1. Kéo dàn từ gốc (có ID >= 349) đang bị lỗi dính chữ về
  const brokenRes = await client.query(`
    SELECT v.id, v.word 
    FROM vocabulary v
    JOIN notebook_vocab nv ON v.id = nv.vocab_id
    WHERE nv.notebook_id = 8 AND v.id >= 361
  `);
  
  const brokenRows = brokenRes.rows;
  const validIds = [];
  let fixCount = 0;

  console.log(`> Bắt đầu map và fix trường word cho dàn ID gốc...`);

  // 2. Chạy qua file chuẩn CSV để map lại chữ có dấu cách vào đúng ID
  for (const row of rows) {
    const rightWord = cleanText(row.word);
    if (!rightWord) continue;

    const squashed = rightWord.replace(/\s+/g, '');
    
    // So khớp chữ ko khoảng trắng để tìm chính xác ID của từ đó trong DB
    const targetRow = brokenRows.find(r => r.word.replace(/\s+/g, '') === squashed);
    
    if (targetRow) {
      await client.query('UPDATE vocabulary SET word = $1 WHERE id = $2', [rightWord, targetRow.id]);
      validIds.push(targetRow.id);
      fixCount++;
    }
  }

  // 3. Thanh trừng sạch sẽ bọn 1000 từ dư thừa
  if (validIds.length > 0) {
    // Tháo liên kết duplicate khỏi notebook 8
    const deleteDuplicateRes = await client.query(`
      DELETE FROM notebook_vocab 
      WHERE notebook_id = 8 AND NOT (vocab_id = ANY($1::bigint[]))
    `, [validIds]);
    
    // Dọn luôn rác triệt để (những từ chơ vơ ko thuộc notebook nào)
    await client.query(`
      DELETE FROM vocabulary 
      WHERE id NOT IN (SELECT vocab_id FROM notebook_vocab)
    `);

    console.log(`> Đã dọn dẹp ${deleteDuplicateRes.rowCount} liên kết duplicate bị dư ra.`);
  }

  return fixCount;
}

async function main() {
  const satCsvFile = resolveDataPath(process.env.SAT_VOCAB_FILE || 'va-c1c2-500-2023-2026.csv');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const count = await fixWordFieldById(client, satCsvFile);

    // Xác nhận lại số lượng cuối cùng
    const finalCheck = await client.query(`SELECT COUNT(*) FROM notebook_vocab WHERE notebook_id = 8`);

    await client.query('COMMIT');
    console.log(`\n[SUCCESS] Fix thành công trường word cho ${count} từ gốc!`);
    console.log(`> Tổng số từ hiện tại trong Notebook 8: ${finalCheck.rows[0].count} từ.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ôi chet, lỗi r:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();