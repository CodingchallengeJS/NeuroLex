const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function main() {
  const file = process.env.VOCAB_FILE || './vocabularies.json';
  if (!fs.existsSync(file)) {
    console.error('vocabularies.json not found at', file);
    process.exit(1);
  }
  const raw = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert notebooks (global)
    const topics = Object.keys(data);
    for (const topic of topics) {
      // upsert by topic+title
      const title = topic;
      const r = await client.query(
        `INSERT INTO notebooks (title, topic, difficulty)
         VALUES ($1,$2,$3)
         ON CONFLICT (title) DO NOTHING
         RETURNING id`,
        [title, topic, 'medium']
      );
      // ignore returned id; we'll select later
    }

    for (const topic of topics) {
      const notebookRes = await client.query('SELECT id FROM notebooks WHERE title = $1 LIMIT 1', [topic]);
      const notebookId = notebookRes.rows[0].id;

      const words = data[topic];
      for (const word of Object.keys(words)) {
        const info = words[word];
        const phonetic = info.pronunciation || '';
        const meaning = info.meaning || '';

        // insert vocabulary (if exists, don't duplicate)
        const vres = await client.query(
          `INSERT INTO vocabulary (word, meaning, phonetic)
           VALUES ($1,$2,$3)
           ON CONFLICT (word) DO UPDATE SET meaning = COALESCE(EXCLUDED.meaning, vocabulary.meaning)
           RETURNING id`,
          [word, meaning, phonetic]
        );
        const vocabId = vres.rows[0].id;

        // link
        await client.query(
          `INSERT INTO notebook_vocab (notebook_id, vocab_id)
           VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [notebookId, vocabId]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Import finished.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
  } finally {
    client.release();
    process.exit(0);
  }
}

main();