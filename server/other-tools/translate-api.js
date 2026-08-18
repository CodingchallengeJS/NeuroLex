require('dotenv').config();
const { Pool } = require('pg');

// Khởi tạo Connection Pool tới PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";

/**
 * Hàm gọi API DeepL để dịch một mảng văn bản
 * @param {string[]} texts - Mảng các từ cần dịch
 * @returns {Promise<string[]>} - Mảng các nghĩa tiếng Việt tương ứng
 */
async function fetchTranslations(texts) {
  try {
    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: texts,
        target_lang: 'VI',
        source_lang: 'EN', // Chỉ định rõ ngôn ngữ nguồn để tăng độ chính xác
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepL API Error: ${response.status} - ${await response.text()}`);
    }

    const data = await response.json();
    return data.translations.map(t => t.text);
  } catch (error) {
    console.error("Lỗi khi kết nối tới DeepL API:", error.message);
    throw error;
  }
}

/**
 * Hàm chính thực thi tiến trình
 */
async function main() {
  const client = await pool.connect();
  
  try {
    console.log("Đang kiểm tra cơ sở dữ liệu...");
    
    // 1. Truy vấn các từ chưa có nghĩa tiếng Việt
    const query = `
      SELECT id, word 
      FROM vocabulary 
      WHERE vietnamese_meaning IS NULL OR vietnamese_meaning = '' OR vietnamese_meaning = 'null'
    `;
    const res = await client.query(query);
    const wordsToTranslate = res.rows;

    if (wordsToTranslate.length === 0) {
      console.log("Không có từ vựng nào cần dịch.");
      return;
    }

    console.log(`Tìm thấy ${wordsToTranslate.length} từ cần dịch. Bắt đầu tiến trình...`);

    // 2. Chia nhỏ mảng thành các batch (Ví dụ: 50 từ mỗi request)
    const BATCH_SIZE = 50; 
    for (let i = 0; i < wordsToTranslate.length; i += BATCH_SIZE) {
      const batch = wordsToTranslate.slice(i, i + BATCH_SIZE);
      const texts = batch.map(item => item.word);
      
      console.log(`Đang dịch batch từ ${i + 1} đến ${i + batch.length}...`);
      
      // Gọi API DeepL cho toàn bộ batch
      const translations = await fetchTranslations(texts);
      
      // 3. Cập nhật cơ sở dữ liệu
      // Bắt đầu một transaction để đảm bảo an toàn dữ liệu
      await client.query('BEGIN');
      
      for (let j = 0; j < batch.length; j++) {
        const vocabId = batch[j].id;
        const translatedText = translations[j];
        
        const updateQuery = `
          UPDATE vocabulary 
          SET vietnamese_meaning = $1 
          WHERE id = $2
        `;
        await client.query(updateQuery, [translatedText, vocabId]);
      }
      
      await client.query('COMMIT');
      console.log(`Đã cập nhật thành công batch từ ${i + 1} đến ${i + batch.length}.`);
    }
    
    console.log("Hoàn tất toàn bộ tiến trình dịch!");

  } catch (error) {
    // Nếu có lỗi trong quá trình cập nhật, rollback lại các thay đổi của transaction hiện tại
    await client.query('ROLLBACK');
    console.error("Đã xảy ra lỗi nghiêm trọng, tiến trình bị hủy bỏ:", error);
  } finally {
    // Luôn luôn giải phóng client kết nối và đóng pool
    client.release();
    await pool.end();
  }
}

// Thực thi hàm main
main();