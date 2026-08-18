import json
import psycopg2
from psycopg2.extras import execute_batch

# ====== CONFIG DATABASE ======
DB_CONFIG = {
    "host": "localhost",
    "database": "envocab",
    "user": "postgres",
    "password": "Quangtrung1234!",
    "port": 5433
}

USER_ID = 1  # đổi nếu cần

# ====== LOAD JSON ======
with open("vocabularies.json", "r", encoding="utf-8") as f:
    data = json.load(f)

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

for topic, words in data.items():
    print(f"Processing topic: {topic}")

    # 1️⃣ Insert notebook
    cur.execute("""
        INSERT INTO notebooks (user_id, title, topic, difficulty)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, topic)
        DO UPDATE SET title = EXCLUDED.title
        RETURNING id;
    """, (USER_ID, topic, topic, "medium"))

    notebook_id = cur.fetchone()[0]

    for word, info in words.items():
        pronunciation = info.get("pronunciation", "")
        meaning = info.get("meaning", "")

        # 2️⃣ Insert vocabulary (nếu chưa tồn tại)
        cur.execute("""
            INSERT INTO vocabulary (word, meaning, phonetic)
            VALUES (%s, %s, %s)
            ON CONFLICT (word) DO UPDATE
            SET meaning = EXCLUDED.meaning
            RETURNING id;
        """, (word, meaning, pronunciation))

        vocab_id = cur.fetchone()[0]

        # 3️⃣ Link notebook - vocabulary
        cur.execute("""
            INSERT INTO notebook_vocab (notebook_id, vocab_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING;
        """, (notebook_id, vocab_id))

conn.commit()
cur.close()
conn.close()

print("✅ Import completed successfully!")