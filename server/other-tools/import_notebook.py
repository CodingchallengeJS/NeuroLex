"""DEPRECATED: superseded by import_vocab.js (npm run seed:topics).

Kept only as a reference implementation. It imports the same
assets/vocabularies.json into the same topic notebooks, but does NOT set
notebook_vocab.sort_order, so the study order will be undefined. Prefer the JS
importer unless you have a reason not to.
"""

import json
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(dotenv_path=BASE_DIR / ".." / ".env")

# ====== CONFIG DATABASE ======
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "database": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

missing = [k for k, v in DB_CONFIG.items() if v in (None, "")]
if missing:
    raise SystemExit(
        "Missing DB settings in server/.env: "
        + ", ".join("DB_" + k.upper() for k in missing)
    )

# ====== LOAD JSON ======
VOCAB_FILE = BASE_DIR / ".." / "assets" / "vocabularies.json"
with open(VOCAB_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

for topic, words in data.items():
    print(f"Processing topic: {topic}")

    # 1️⃣ Insert notebook
    # notebooks has no user_id column; title is the unique key (see createdb.sql).
    cur.execute("""
        INSERT INTO notebooks (title, topic, difficulty)
        VALUES (%s, %s, %s)
        ON CONFLICT (title)
        DO UPDATE SET topic = EXCLUDED.topic
        RETURNING id;
    """, (topic, topic, "medium"))

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