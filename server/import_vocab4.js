require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const { Pool } = require('pg');

// Initialize the Database Pool
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432), // Standard postgres port is usually 5432
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// Helper function to convert string "null" from CSV to actual JavaScript null
const parseNull = (val) => {
  return val.trim();
};

async function seedDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Connected to the database. Starting seed process...');
    
    // 1. Create or get the Notebook
    // ON CONFLICT requires a UNIQUE constraint, which 'title' has in your schema
    const notebookQuery = `
      INSERT INTO notebooks (title, topic, difficulty) 
      VALUES ($1, $2, $3)
      ON CONFLICT (title) DO UPDATE SET title = EXCLUDED.title 
      RETURNING id;
    `;
    const notebookRes = await client.query(notebookQuery, [
      'Cambridge IELTS Advanced', 
      'IELTS Vocabulary', 
      'Advanced'
    ]);
    const notebookId = notebookRes.rows[0].id;
    console.log(`Notebook secured with ID: ${notebookId}`);

    // 2. Read the CSV and process rows
    const results = [];
    
    // Read the refactored CSV output from the previous step
    fs.createReadStream('cleaned_vocabulary.csv')
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        console.log(`Parsed ${results.length} rows from CSV. Inserting into database...`);
        
        let sortOrder = 1;

        // Loop through each word sequentially to prevent connection pool exhaustion
        for (const row of results) {
          const word = parseNull(row.word);
          const phonetic = parseNull(row.pronounciation); // mapped to phonetic
          const english_meaning = parseNull(row.english_meaning);
          const vietnamese_meaning = parseNull(row.vietnamese_meaning);
          const synonyms = parseNull(row.synonyms);
          const example = parseNull(row.example);

          if (!word) continue;

          // 3. Insert Vocabulary
          // Using ON CONFLICT (word) to prevent duplicate errors
          const vocabQuery = `
            INSERT INTO vocabulary 
              (word, english_meaning, vietnamese_meaning, synonyms, phonetic, example)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (word) DO UPDATE SET
              english_meaning = EXCLUDED.english_meaning,
              vietnamese_meaning = EXCLUDED.vietnamese_meaning,
              synonyms = EXCLUDED.synonyms,
              phonetic = EXCLUDED.phonetic,
              example = EXCLUDED.example
            RETURNING id;
          `;
          
          const vocabRes = await client.query(vocabQuery, [
            word,
            english_meaning,
            vietnamese_meaning,
            synonyms,
            phonetic,
            example
          ]);
          
          const vocabId = vocabRes.rows[0].id;

          // 4. Link Vocabulary to Notebook (notebook_vocab)
          const linkQuery = `
            INSERT INTO notebook_vocab (notebook_id, vocab_id, sort_order)
            VALUES ($1, $2, $3)
            ON CONFLICT (notebook_id, vocab_id) DO NOTHING;
          `;
          await client.query(linkQuery, [notebookId, vocabId, sortOrder]);
          
          sortOrder++;
        }
        
        console.log('✅ Seeding completed successfully!');
        client.release();
        await pool.end();
      });
      
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    client.release();
    await pool.end();
  }
}

// Run the script
seedDatabase();