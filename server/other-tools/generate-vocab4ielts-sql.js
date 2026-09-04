/**
 * LEGACY / REFERENCE ONLY - use import-vocab4ielts-units.js instead.
 *
 * Original generator for the 20 "vocab4ielt-N <topic>" notebooks. It parses
 * assets/cambridge-vocab4ielts-advanced.txt and writes assets/import_data.sql,
 * which you then had to run through psql by hand.
 *
 * Two reasons it is no longer the seeding path:
 *
 * 1. Its input file was never committed. The 20 notebooks were recovered from
 *    the development database into assets/vocab4ielts-units.json instead, and
 *    import-vocab4ielts-units.js loads that directly - no psql step.
 *
 * 2. The fallback in the generated SQL never worked. A data-modifying CTE
 *    (new_vocabs) is not visible to another CTE reading the same table in the
 *    same statement, so `all_vocabs` cannot see the rows new_vocabs inserts.
 *    Genuinely new words fail the JOIN and are dropped rather than landing in
 *    "vocab4ielts-other" - which is why that notebook has 0 words.
 *
 * Kept in case the original .txt turns up and you want to regenerate from it.
 */
const fs = require('fs');
const path = require('path');

const topics = [
    "Human nature", "Time for a change", "No man is an island", "Scientific discovery",
    "Striving to achieve", "Powers of persuasion", "Ways and means", "State control",
    "Natural history", "Rocket science", "Progress", "The latest thing",
    "Urban jungle", "Tackling issues", "This Earth", "Energy efficient",
    "Getting down to business", "Law enforcement", "The media", "A matter of taste"
];

function generateSQL() {
    const inputFilePath = path.join(__dirname, '../assets/cambridge-vocab4ielts-advanced.txt');
    const outputFilePath = path.join(__dirname, '../assets/import_data.sql');

    try {
        const rawText = fs.readFileSync(inputFilePath, 'utf8');
        const lines = rawText.split('\n');

        let currentUnitIndex = -1;
        let currentNotebookTitle = "";
        let mappings = [];

        lines.forEach(line => {
            // Dọn rác
            line = line.trim();
            if (!line) return;

            // Bắt Unit
            const unitMatch = line.match(/^Unit\s+(\d+)/i);
            if (unitMatch) {
                currentUnitIndex = parseInt(unitMatch[1], 10) - 1;
                if (currentUnitIndex < topics.length) {
                    const topic = topics[currentUnitIndex];
                    currentNotebookTitle = `vocab4ielt-${unitMatch[1]} ${topic}`;
                }
                return;
            }

            // Bỏ qua header
            if (/^(Noun|Adjective|Verb|Phrase)$/i.test(line)) return;

            // Lấy từ vựng
            if (currentUnitIndex !== -1 && currentNotebookTitle) {
                let word = line.split('/')[0].trim();
                if (word) {
                    let sqlWord = word.replace(/'/g, "''"); // Tránh lỗi dấu nháy đơn
                    mappings.push(`('${currentNotebookTitle}', '${sqlWord}')`);
                }
            }
        });

        // Tạo chuỗi INSERT cho 20 notebook
        const notebooksInsert = topics.map((topic, i) => 
            `('vocab4ielt-${i + 1} ${topic}', '${topic}', 'Advanced')`
        ).join(',\n    ');

        // Logic SQL khét lẹt đính kèm Fallback
        const sqlOutput = `
-- BƯỚC 1: KHỞI TẠO 20 NOTEBOOKS CHÍNH + 1 NOTEBOOK FALLBACK
INSERT INTO notebooks (title, topic, difficulty) VALUES
    ${notebooksInsert},
    ('vocab4ielts-other', 'Missing Vocab Fallback', 'Advanced')
ON CONFLICT (title) DO NOTHING;

-- BƯỚC 2: MAPPING TOÀN BỘ DATA TỪ TEXT FILE
WITH vocab_mapping(unit_title, word) AS (
    VALUES
    ${mappings.join(',\n    ')}
),
-- BƯỚC 3: TÌM VÀ AUTO-ADD NHỮNG TỪ CHƯA CÓ TRONG KHO VOCAB (TRÁNH LỖI KHOÁ NGOẠI)
new_vocabs AS (
    INSERT INTO vocabulary (word)
    SELECT DISTINCT m.word 
    FROM vocab_mapping m
    LEFT JOIN vocabulary v ON LOWER(v.word) = LOWER(m.word)
    WHERE v.id IS NULL
    RETURNING id, word
),
-- BƯỚC 4: LẤY ID CỦA TẤT CẢ CÁC TỪ TRONG KHO (CẢ CŨ LẪN VỪA ĐƯỢC TẠO MỚI)
all_vocabs AS (
    SELECT id, LOWER(word) as word FROM vocabulary
)
-- BƯỚC 5: NHÉT TỪ VÀO NOTEBOOK DỰA TRÊN LOGIC FALLBACK
INSERT INTO notebook_vocab (notebook_id, vocab_id, sort_order)
SELECT 
    CASE 
        -- Nếu là từ mới (nằm trong CTE new_vocabs) -> Bẻ lái nhét vào vocab4ielts-other
        WHEN nv.id IS NOT NULL THEN (SELECT id FROM notebooks WHERE title = 'vocab4ielts-other')
        -- Nếu là từ cũ -> Nhét vào đúng Unit ban đầu
        ELSE n.id
    END AS notebook_id,
    a.id AS vocab_id,
    ROW_NUMBER() OVER (PARTITION BY 
        CASE 
            WHEN nv.id IS NOT NULL THEN (SELECT id FROM notebooks WHERE title = 'vocab4ielts-other')
            ELSE n.id
        END 
    ORDER BY a.id) AS sort_order
FROM vocab_mapping m
LEFT JOIN new_vocabs nv ON LOWER(nv.word) = LOWER(m.word)
JOIN all_vocabs a ON a.word = LOWER(m.word)
LEFT JOIN notebooks n ON n.title = m.unit_title
ON CONFLICT (notebook_id, vocab_id) DO NOTHING;
`;

        fs.writeFileSync(outputFilePath, sqlOutput.trim(), 'utf8');
        console.log(`[Thành công] Đã quét được ${mappings.length} từ vựng!`);
        console.log(`[Hoàn tất] File SQL đã được tạo tại: ${outputFilePath}`);

    } catch (error) {
        console.error("Ôi lỗi vch:", error.message);
    }
}

if (!fs.existsSync(path.join(__dirname, '../assets/cambridge-vocab4ielts-advanced.txt'))) {
    console.error('Input file assets/cambridge-vocab4ielts-advanced.txt is missing.');
    console.error('Use `node other-tools/import-vocab4ielts-units.js` instead - it reads');
    console.error('assets/vocab4ielts-units.json, recovered from the database.');
    process.exit(1);
}

generateSQL();
