# NeuroLex — Roadmap

Trạng thái: viết ngày 2026-09-04, dựa trên commit `9804c6a`.

Ưu tiên: **P0** = làm trước (nợ kỹ thuật đang chặn việc khác) → **P4** = làm khi rảnh.

---

## 0. Hiện trạng (để tham chiếu)

| Phần | Tình trạng |
|---|---|
| Backend | 1 file `server/index.js` (995 dòng), 17 route, Express + `pg` thuần |
| Schema | `server/createdb.sql` — 6 bảng, chưa có bảng câu hỏi, chưa có tag |
| Frontend | Vite + React 18, 4 trang, `client/src/api/index.js` gọi cứng `:8000` |
| Dữ liệu | ~3000 từ trong `server/assets/`, 440 câu hỏi trong `440-wic-question.json` (chưa vào DB) |
| Import tools | 12 script trong `server/other-tools/` — **phần lớn đang hỏng đường dẫn** |
| Deploy | Chỉ có `nginx.conf` thủ công, chưa có Docker, chưa có migration |

---

## P0 — Sửa `server/other-tools/` (đường dẫn + bảo mật) ✅ XONG 2026-09-04

Sau khi bạn chuyển các script vào `other-tools/`, `__dirname` đã đổi nhưng code chưa đổi. Hiện tại **đa số script chạy sẽ crash**.

### P0.1 Sửa đường dẫn tương đối

| File | Dòng | Vấn đề | Sửa thành |
|---|---|---|---|
| `import_vocab.js` | 19 | `path.resolve(__dirname, filePath)` → `other-tools/vocabularies.json` (không tồn tại) | `path.resolve(__dirname, '../assets', filePath)` |
| `import_vocab.js` | 260-261 | default `'vocabularies.json'`, `'va-c1c2-500-2023-2026.csv'` | giữ tên file, để `resolveDataPath` lo phần `../assets` |
| `import_vocab2.js` | 138 | `path.resolve(__dirname, 'magoosh')` | `path.resolve(__dirname, '../assets/magoosh')` |
| `fix_import_vocab2.js` | 72 | như trên | như trên |
| `import_vocab4.js` | 46 | `fs.createReadStream('cleaned_vocabulary.csv')` — phụ thuộc cwd | `path.join(__dirname, '../assets/cleaned_vocabulary.csv')` |
| `import_notebook.py` | 17 | `open("vocabularies.json")` — phụ thuộc cwd | `Path(__file__).parent / "../assets/vocabularies.json"` |
| `vocabmagoosh.py` | 39, 47 | `data.json` — phụ thuộc cwd | dùng `Path(__file__).parent` |

`import_vocab3.js:164` và `import_question.js:68-69` đã dùng `../assets/` — **đúng rồi**, dùng 2 file này làm mẫu.

### P0.2 `dotenv` không tìm thấy `.env`

Mọi script JS gọi `require('dotenv').config()` → chỉ đọc `.env` ở **cwd**. Chạy `node other-tools/import_vocab.js` từ `server/` thì may mắn đúng, chạy từ trong `other-tools/` thì hỏng.

```js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
```

Áp dụng cho cả 7 file JS + `addtostudy.py` (`load_dotenv(dotenv_path=...)`).

### P0.3 Mật khẩu DB hard-code trong git (nghiêm trọng)

`server/other-tools/import_notebook.py:10` chứa `"password": "Quangtrung1234!"` và **đã được commit**.

- [x] Đổi sang `os.getenv("DB_PASSWORD")` như `addtostudy.py:54` đã làm
- [ ] **Đổi mật khẩu Postgres thật** — nó đã nằm trong lịch sử git, sửa file không xoá được lịch sử
- [ ] Nếu repo là public: cân nhắc `git filter-repo` để xoá khỏi history

### P0.4 `import_notebook.py` đã chết theo schema

Script này `INSERT INTO notebooks (user_id, title, topic, difficulty)` với `ON CONFLICT (user_id, topic)` — nhưng schema hiện tại **không có cột `user_id`** trong `notebooks` (xem `createdb.sql:17-23`). Chọn 1 trong 2:

- Xoá file (chức năng đã bị `import_vocab.js` thay thế), **hoặc**
- Viết lại theo schema mới sau khi làm P2.2 (thêm `owner_user_id`)

### P0.5 Gom `other-tools` thành CLI có tài liệu

Hiện có 12 script tên `import_vocab.js`, `import_vocab2.js`, `import_vocab3.js`, `import_vocab4.js`, `fix_import_vocab2.js`, `import_vocab4.py`… không ai đoán được cái nào làm gì.

- [x] Thêm `server/other-tools/README.md`: mỗi script — nguồn dữ liệu nào, tạo notebook tên gì, chạy 1 lần hay nhiều lần
- [x] Đổi tên theo nguồn dữ liệu, không theo số thứ tự:
  - `import_vocab.js` → `import-topics-and-sat-c1c2.js`
  - `import_vocab2.js` → `import-magoosh.js`
  - `import_vocab3.js` → `import-va-b2c1-markdown.js`
  - `import_vocab4.js` → `import-cleaned-csv.js`
  - `index_old.js` → xoá (đã có git history)
- [x] Thêm npm scripts vào `server/package.json`: `"seed:topics"`, `"seed:magoosh"`, … để không phải nhớ đường dẫn
- [x] `import_vocab3.js`: hằng số ở dòng 117 là `'SAT B2C1 1000 P4'` nhưng log dòng 178 in `P1` → sai lệch. Tham số hoá phần `part` qua `argv` thay vì sửa tay 4 lần

---

## P1 — Đóng gói Docker + deploy Render ✅ XONG 2026-09-04 (trừ 2 mục dưới)

Mục tiêu: `git push` → Render tự build web + tự tạo DB + tự seed dữ liệu, không thao tác tay.

**Đã làm:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `docker-entrypoint.sh`,
`render.yaml`, `server/db.js` (hỗ trợ `DATABASE_URL`), `server/migrate.js` +
`server/migrations/`, `server/seed.js`, `server/.env.example`, client gọi `/api`
tương đối + proxy trong Vite.

**Đã kiểm chứng thật:** migration chạy trên DB có sẵn → không mất dữ liệu (48 sổ
tay / 2869 từ / 4 user giữ nguyên); migrate + seed trên một DB **rỗng hoàn toàn**
→ tự sinh 45 sổ tay / 2798 từ / 3627 liên kết; boot lần 2 tự bỏ qua seed; Express
phục vụ `client/dist` đúng (`/` và `/notebooks` → index.html, `/api/health` → JSON,
`/api/nope` → 404 chứ không phải index.html).

> ⚠️ **Chưa build thử image Docker** — máy dùng để viết code này không cài Docker.
> `Dockerfile` và `docker-compose.yml` mới chỉ được kiểm tra cú pháp (YAML hợp lệ,
> mọi file `COPY` đều tồn tại, entrypoint LF). Chạy `docker compose up --build` một
> lần để xác nhận trước khi deploy.

### P1.1 Chặn đứng: URL API gọi cứng port 8000 ✅

`client/src/api/index.js:1`:

```js
const API_BASE = `http://${window.location.hostname}:8000/api`;
```

Trên Render chỉ có **1 port công khai** và bắt buộc **HTTPS** → dòng này chắc chắn hỏng (mixed-content + sai port).

```js
const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
```

Rồi để Express serve luôn thư mục `client/dist` — một service duy nhất, không CORS, không nginx. Đây là cách rẻ nhất trên Render (free tier chỉ cho 1 web service).

### P1.2 Cho Express serve static build ✅

Thêm vào cuối `server/index.js`, **sau** tất cả route `/api`:

```js
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}
```

### P1.3 Multi-stage Dockerfile

```dockerfile
# stage 1: build client
FROM node:20-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# stage 2: server + static
FROM node:20-alpine
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /app/client/dist /app/client/dist
EXPOSE 8000
CMD ["node", "index.js"]
```

- [x] Thêm `.dockerignore` (`node_modules`, `.env`, `client/dist`, `.git`, `a.cpp`)
- [x] `docker-compose.yml` cho môi trường local: service `db` (postgres:16) + `app`, có healthcheck để app chờ DB sẵn sàng

### P1.4 Migration thay cho `createdb.sql`

`createdb.sql:3` mở đầu bằng `DROP SCHEMA public CASCADE` — **không được để nó chạy tự động trên Render**, một lần deploy sai là mất sạch dữ liệu người dùng.

- [x] Tạo `server/migrations/001_init.sql`, `002_*.sql`… (nội dung hiện tại của `createdb.sql`, **bỏ phần DROP**)
- [x] Bảng `schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMP)`
- [x] `server/migrate.js`: đọc thư mục, chạy file chưa có trong `schema_migrations`, trong 1 transaction
- [x] `add_vocab_to_review()` — hàm plpgsql này chỉ tồn tại trong DB trên máy, chưa bao giờ có trong repo (phát hiện khi làm P0, đã dump vào cuối `createdb.sql`). Khi tách migration nhớ đưa nó thành 1 file riêng, và **rà lại xem còn object nào chỉ sống trong DB local** (trigger, view, index tự tạo tay)
- [ ] Chuyển `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` đang rải rác trong `import_vocab*.js` (ví dụ `import_vocab3.js:170-173`) vào migration — script import không nên tự đổi schema
- [ ] Giữ `createdb.sql` như `scripts/reset-dev-db.sql` với cảnh báo rõ ràng

### P1.5 Seed dữ liệu tự động, idempotent

- [x] Cứu dữ liệu 20 sổ tay `vocab4ielt-*`: script sinh ra chúng nằm ngoài repo và file `.txt` đầu vào đã mất. Đã export mapping từ DB ra `assets/vocab4ielts-units.json` + viết `import-vocab4ielts-units.js`, nên deploy mới tự có đủ **45 sổ tay** thay vì 25
- [x] `server/seed.js` chạy tuần tự mọi importer, đọc từ `server/assets/`
- [x] Mọi `INSERT` phải `ON CONFLICT DO NOTHING/UPDATE` (phần lớn đã có) → chạy lại nhiều lần vẫn an toàn
- [x] Seed chạy trong `docker-entrypoint.sh` (`RUN_SEED`/`FORCE_SEED`); cờ cũ dự kiến `SEED_ON_BOOT=true` hoặc Render pre-deploy command: `node migrate.js && node seed.js`

### P1.6 Cấu hình cho Render

- [x] `render.yaml` (blueprint): 1 web service (Docker) + 1 Postgres
- [x] Đọc `DATABASE_URL` (Render cấp sẵn) thay vì 5 biến rời:

  ```js
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : new Pool({ host: ..., port: ... });
  ```

  Hiện `server/index.js:12-26` **bắt buộc** phải có đủ `DB_HOST`…`DB_PASSWORD` nếu không sẽ throw → phải nới điều kiện này.
- [x] `app.listen(process.env.PORT)` — đã đúng (dòng 991), nhưng default là `4000` trong khi README nói `8000`, nên đồng bộ lại
- [x] `.env.example` đưa vào git (`.env` thật vẫn gitignore — đã đúng)
- [x] Bỏ `cors()` mở toàn bộ (`index.js:44`) khi đã cùng origin, hoặc giới hạn `origin: process.env.CLIENT_ORIGIN`
- [x] `vite.config.js` đang hard-code `allowedHosts: ['laptop-3eisd1fs.dtth.ts']` — chuyển sang biến môi trường, đừng commit hostname máy cá nhân
- [x] Lưu ý free tier Render (đã ghi trong README): instance ngủ sau 15 phút → lần vào đầu tiên chậm ~30s; Postgres free hết hạn sau 90 ngày, cần script `pg_dump` backup

---

## P2 — Dọn dẹp sổ tay: đặt tên + phân loại tag

Vấn đề gốc: mỗi script import tự đặt tên theo kiểu riêng, không có quy ước nào.

Hiện tại trong DB đang có ít nhất 4 hệ đặt tên trộn lẫn:

| Nguồn | Title | Topic | Difficulty |
|---|---|---|---|
| `import_vocab.js:193` | `Urbanization & Migration` (= topic) | `Urbanization & Migration` | `medium` |
| `import_vocab.js:226` | `SAT C1-C2 500 (2023-2026)` | `SAT Vocabulary` | `C1-C2` |
| `import_vocab2.js:88-92` | `Ielts Common 1`, `Ielts Hard 2`… (viết hoa sai: "Ielts") | `IELTS Magoosh` | `mixed` |
| `import_vocab3.js:117` | `SAT B2C1 1000 P4` | `SAT Vocabulary` | `B2-C1` |
| `index.js:562` | `Chunk` | `Custom` | `mixed` |
| `import-vocab4ielts-units.js` | `vocab4ielt-1 Human nature` … (20 sổ) | tên unit | `Advanced` |

Để ý `vocab4ielt-*`: viết tắt (thiếu chữ `s`), số không pad, `topic` là tên unit chứ không phải bộ đề. Đổi thành `Cambridge IELTS Advanced — Unit 01: Human nature` khi làm P2.1.
Ngoài ra `vocab4ielts-other` (id 71) đang có **0 từ** do lỗi CTE trong script cũ — nên xoá khỏi DB đang chạy, seed mới không tạo nó nữa.

→ `difficulty` là bãi rác: `medium` / `mixed` / `C1-C2` / `B2-C1` trộn 2 thang đo khác nhau. `topic` khi thì bằng `title`, khi thì là tên bộ đề. Frontend (`NotebookGrid.jsx:14`) chỉ hiển thị được đúng 1 badge `difficulty`.

### P2.1 Chuẩn hoá quy ước đặt tên

Chốt một quy tắc rồi ép mọi importer theo:

- Tên hiển thị: `IELTS Magoosh — Hard 2`, `SAT B2-C1 1000 — Part 4`, `Chủ đề — Môi trường & Biến đổi khí hậu`
- `IELTS`/`SAT`/`TOEFL` luôn viết hoa toàn bộ (sửa `formatTitle` ở `import_vocab2.js:88`)
- Dùng dấu gạch dài phân tách bộ đề và phần, không dùng viết tắt `P1`/`P4`
- Thêm cột `slug` (unique, kebab-case) để dùng trong URL, `title` chỉ để hiển thị → đổi tên hiển thị không vỡ link

### P2.2 Schema: thay `topic`/`difficulty` bằng tag thật

```sql
ALTER TABLE notebooks ADD COLUMN slug VARCHAR(255) UNIQUE;
ALTER TABLE notebooks ADD COLUMN description TEXT;
ALTER TABLE notebooks ADD COLUMN owner_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;  -- NULL = sổ tay hệ thống
ALTER TABLE notebooks ADD COLUMN cefr_level VARCHAR(10);   -- A1..C2, chuẩn hoá riêng
ALTER TABLE notebooks ADD COLUMN is_public BOOLEAN DEFAULT TRUE;

CREATE TABLE tags (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL   -- 'exam' | 'topic' | 'source' | 'level'
);

CREATE TABLE notebook_tags (
  notebook_id BIGINT REFERENCES notebooks(id) ON DELETE CASCADE,
  tag_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (notebook_id, tag_id)
);
```

Bộ tag khởi tạo: `exam:ielts`, `exam:sat`, `exam:toefl`, `source:magoosh`, `source:cambridge`, `topic:environment`, `topic:technology`, `level:b2-c1`…

Một sổ tay giờ có nhiều tag (`exam:ielts` + `source:magoosh` + `level:c1`) thay vì nhét tất cả vào 1 chuỗi `difficulty`.

### P2.3 Migration dữ liệu cũ

- [ ] `003_backfill_notebook_tags.sql`: map từng `topic` hiện có sang tag tương ứng
- [ ] Chuẩn hoá `difficulty` → `cefr_level`: `medium`→`B1-B2`, `mixed`→`NULL`, `C1-C2`→`C1-C2`
- [ ] Đổi tên các sổ tay `Ielts *` sang `IELTS Magoosh — *`
- [ ] Giữ cột cũ 1-2 release rồi mới `DROP`

### P2.4 API + UI

- [ ] `GET /api/notebooks?tag=exam:ielts&level=c1&q=...` — lọc và tìm theo tên
- [ ] `GET /api/tags` — trả về tag kèm số sổ tay
- [ ] `NotebookGrid.jsx`: hiện nhiều chip tag, màu theo `kind`, thay 1 badge `difficulty` như hiện nay
- [ ] Thanh lọc tag ở đầu `NotebooksPage` + gom nhóm theo `exam`
- [ ] `CreateNotebookModal.jsx`: chọn tag thay vì gõ tự do `topic`/`difficulty` (nguồn gốc của mớ hỗn độn)
- [ ] Sửa `POST /api/notebooks` (`index.js:270`) — hiện **không có `authenticateToken`**, ai cũng tạo được sổ tay toàn cục; gắn `owner_user_id = req.auth.userId`
- [ ] Đổi tên / xoá / sắp xếp lại sổ tay (hiện chưa có `PUT`/`DELETE /api/notebooks/:id`)
- [ ] Sổ tay `Chunk` (`index.js:552-606`) hiện là **toàn cục dùng chung cho mọi user** — user B ghi đè chunk của user A. Phải gắn `owner_user_id` và tìm theo `(owner_user_id, slug)`

---

## P3 — Ngân hàng câu hỏi + tìm câu hỏi chứa từ đã học

Đây là tính năng lớn nhất. Dữ liệu đã có sẵn: `server/assets/440-wic-question.json` — 440 câu trắc nghiệm A/B/C/D dạng "the word X is closest in meaning to".

**Chốt chặn: 440 câu này chưa từng vào database.** `import_question.js` chỉ convert `.txt` → `.json`, không hề đụng tới Postgres.

### P3.0 Sửa parser trước khi import

Kiểm tra dữ liệu hiện tại:

- 440 câu, **11 câu `options` rỗng**, **2 câu `answer` là `null`**
- 436 câu có cụm "closest in meaning" nhưng chỉ **406 câu** được gắn `type: 'vocabulary'` → ~30 câu phân loại sai

Nguyên nhân: `import_question.js:48-51` kiểm tra `includes("closest in meaning")` **trước** khi chuẩn hoá xuống dòng ở dòng 53. Câu nào bị ngắt dòng giữa cụm từ ("closest in\nmeaning") sẽ lọt lưới.

- [ ] Chuyển dòng 53 (`.replace(/\n/g, " ")`) lên **trước** phần kiểm tra `type`
- [ ] Log ra 11 câu options rỗng + 2 câu thiếu đáp án, sửa tay hoặc loại bỏ
- [ ] Trích **từ mục tiêu** từ dấu ngoặc kép — đã kiểm chứng: **430/440 câu** khớp regex `/[Tt]he (?:word|phrase|expression) "([^"]+)"/`, ra **409 từ riêng biệt**

### P3.1 Schema ngân hàng câu hỏi

```sql
CREATE TABLE question_sets (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,      -- 'wic-440'
  title VARCHAR(255) NOT NULL,
  source VARCHAR(255),                     -- 'VietAccepted 440 Vocabulary Questions'
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE questions (
  id BIGSERIAL PRIMARY KEY,
  set_id BIGINT REFERENCES question_sets(id) ON DELETE CASCADE,
  external_id INTEGER,                     -- id 1..440 trong file gốc
  prompt TEXT NOT NULL,
  question_type VARCHAR(30) NOT NULL,      -- 'word_in_context' | 'synonym' | 'cloze'
  options JSONB NOT NULL,                  -- {"A":"typical","B":...}
  answer_key VARCHAR(4) NOT NULL,
  explanation TEXT,
  difficulty VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (set_id, external_id)
);

-- điểm mấu chốt của tính năng "tìm câu hỏi chứa từ đã học"
CREATE TABLE question_vocab (
  question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
  vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,               -- 'target' | 'option' | 'context'
  surface_form VARCHAR(255),               -- dạng thực tế: 'prized', 'overtaken'
  PRIMARY KEY (question_id, vocab_id, role)
);
CREATE INDEX idx_question_vocab_vocab ON question_vocab(vocab_id);

CREATE TABLE user_question_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
  selected_key VARCHAR(4),
  is_correct BOOLEAN,
  answered_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_uqa_user ON user_question_attempts(user_id, answered_at DESC);
```

### P3.2 Liên kết câu hỏi ↔ từ vựng (phần khó nhất)

Từ mục tiêu trong câu hỏi ở **dạng biến cách**: `prized`, `overtaken`, `extracting`, `freeing`. Bảng `vocabulary` lưu **dạng nguyên thể**. So khớp chuỗi thẳng sẽ trượt rất nhiều.

Chiến lược, theo thứ tự:

1. Khớp chính xác `LOWER(v.word) = LOWER(surface_form)`
2. Chuẩn hoá hậu tố đơn giản: `-s`, `-es`, `-ed`, `-ing`, `-ly`, `-er`, `-est`, xử lý gấp đôi phụ âm (`plunged`→`plunge`)
3. Postgres trigram: `CREATE EXTENSION pg_trgm;` rồi `similarity(v.word, surface) > 0.75`
4. Ánh xạ thủ công cho phần còn lại (dự kiến < 50 từ) trong `server/assets/lemma-overrides.json`
5. Từ nào không map được → tự tạo `vocabulary` row với dạng nguyên thể, đưa vào sổ tay `Từ vựng từ ngân hàng câu hỏi`

Cũng nên map cả 4 phương án (`role='option'`) — đó là các từ đồng nghĩa/gây nhiễu, cũng đáng để tra cứu.

- [ ] `server/other-tools/import-question-bank.js`: đọc JSON → điền `question_sets`, `questions`, `question_vocab`
- [ ] In báo cáo cuối: bao nhiêu câu, bao nhiêu liên kết, bao nhiêu từ không map được

### P3.3 API

```
GET  /api/questions?set=wic-440&limit=20&offset=0
GET  /api/questions/:id
GET  /api/questions/search?q=prize            -- tìm theo từ (đã lemma hoá)
GET  /api/questions/for-word/:vocabId         -- mọi câu hỏi chứa từ này
GET  /api/questions/studied     [auth]        -- tính năng chính
POST /api/questions/attempt     [auth]        -- ghi nhận trả lời
GET  /api/questions/review      [auth]        -- câu trả lời sai, để làm lại
```

`GET /api/questions/studied` — "câu hỏi chứa từ tôi đã học":

```sql
SELECT q.*, array_agg(DISTINCT v.word) AS matched_words
FROM questions q
JOIN question_vocab qv ON qv.question_id = q.id
JOIN user_vocab_progress uvp ON uvp.vocab_id = qv.vocab_id
LEFT JOIN vocabulary v ON v.id = qv.vocab_id
WHERE uvp.user_id = $1
  AND ($2::text IS NULL OR qv.role = $2)          -- lọc 'target'
  AND ($3::int IS NULL OR uvp.repetition_level >= $3)
  AND ($4::bigint IS NULL OR EXISTS (              -- lọc theo sổ tay
        SELECT 1 FROM notebook_vocab nv
        WHERE nv.vocab_id = qv.vocab_id AND nv.notebook_id = $4))
GROUP BY q.id
ORDER BY count(DISTINCT qv.vocab_id) DESC, q.id
LIMIT $5 OFFSET $6;
```

Bộ lọc nên có: chỉ từ đã thuộc (`mastered`), chỉ từ đang đến hạn ôn (`next_review_at <= now()`), theo sổ tay, chưa từng trả lời, đã trả lời sai.

### P3.4 UI

- [ ] Trang `/questions` — duyệt ngân hàng câu hỏi, lọc theo bộ đề
- [ ] Trang `/questions/studied` — "Luyện với từ bạn đã học", highlight từ khớp ngay trong đề bài
- [ ] Ở thẻ từ (`VocabCard`): mục "Xuất hiện trong N câu hỏi" → link sang
- [ ] Sau khi trả lời: hiện đáp án + liên kết tới từ vựng liên quan
- [ ] Trả lời sai → cân nhắc hạ `repetition_level` của từ đó (nối ngân hàng câu hỏi vào vòng lặp SRS, đây mới là điểm ăn tiền)
- [ ] Thống kê: tỉ lệ đúng theo bộ đề, theo sổ tay

### P3.5 Mở rộng về sau

- [ ] Nhập thêm bộ đề (`cambridge-ielts-advanced.csv` đang nằm không trong `assets/`)
- [ ] Sinh câu hỏi cloze tự động từ trường `example` của từ vựng
- [ ] Người dùng tự thêm câu hỏi + gắn từ

---

## P4 — Lỗi và cải tiến phát hiện khi đọc code

### Lỗi cần sửa

| Nơi | Vấn đề |
|---|---|
| `NotebooksPage.jsx:48-52` | `useEffect` **không có dependency array** → gọi `fetchVocabCount()` lại sau **mỗi lần render**. Thêm `[activeNb]` |
| `NotebooksPage.jsx:78` | `n.id.toString() === activeNb` so sánh string với giá trị `setActiveNb(nb.id)` — mong manh, phụ thuộc việc `pg` trả `BIGSERIAL` dưới dạng string. Ép kiểu một chỗ duy nhất |
| `index.js:270` | `POST /api/notebooks` **không xác thực** — ai cũng tạo được sổ tay toàn cục |
| `index.js:326` | `POST /api/notebooks/:id/vocabs` **không xác thực** — ai cũng thêm từ vào sổ tay của người khác |
| `index.js:373` | `PUT /api/vocabs/:id` có auth, nhưng sửa `vocabulary` toàn cục → 1 user sửa nghĩa là **mọi người** thấy. Cần bảng `user_vocab_override` hoặc chỉ cho chủ sở hữu sửa |
| `index.js:552` | Sổ tay `Chunk` dùng chung toàn hệ thống (đã nêu ở P2.4) |
| `createdb.sql:69-74` | `user_notebook_progress` dùng `INTEGER` trong khi `users.id`/`notebooks.id` là `BIGSERIAL` — sai kiểu, sẽ tràn |
| `index.js:731` | `/api/quiz/generate` chạy **2 query trong vòng lặp cho mỗi từ** (N+1, tới 20 query cho 10 từ). Gộp thành 1 query dùng `LATERAL` |
| `a.cpp` | File rỗng lạc trong repo gốc — xoá |

### Thiếu vắng

- [ ] **Không có test nào**. `package.json` gốc còn ghi `"test": "echo \"Error: no test specified\" && exit 1"`. Ít nhất phải test `applyQuizResult` (`index.js:890`) — đây là trái tim thuật toán SRS
- [ ] **Không có rate limit** trên `/api/auth/login` → brute-force thoải mái. Thêm `express-rate-limit`
- [ ] **Không có refresh token** — JWT sống 7 ngày, không thể thu hồi
- [ ] **Không có logger** — chỉ `console.error`. Thêm `pino`
- [ ] **Không có validate input** tập trung — thêm `zod`
- [ ] `server/index.js` 995 dòng, một file. Tách `routes/`, `services/`, `db/`
- [ ] `package.json` ở thư mục gốc ghi `"name": "server"` và `"start": "node server/index.js"`, trùng lặp với `server/package.json` — dọn hoặc chuyển thành npm workspace

### Tính năng đáng thêm

- [ ] Thuật toán SRS: `getIntervalDaysForLevel` (`index.js:496`) là bảng cứng 1/3/7/14/30 ngày. Nâng lên SM-2 hoặc FSRS với `ease_factor` theo từng từ
- [ ] Chuỗi ngày học (streak) + mục tiêu hằng ngày — động lực học rất mạnh, chi phí rẻ
- [ ] Phát âm: hiện dùng `SpeechSynthesisUtterance` (`StudyPage.jsx:38`), chất lượng phụ thuộc máy. Cân nhắc cache audio từ Free Dictionary API
- [ ] Xuất/nhập tiến độ (JSON/CSV) — quan trọng khi Postgres free tier của Render hết hạn sau 90 ngày
- [ ] PWA + offline: học từ trên điện thoại lúc không mạng
- [ ] Điều hướng bằng bàn phím ở `StudyPage` (Space = lật thẻ, mũi tên trái/phải = chưa thuộc/đã thuộc)
- [ ] Hiện `total_reviews`, `correct_streak` ngay trên thẻ từ — dữ liệu đã có sẵn trong DB nhưng chưa hiển thị
- [ ] Tìm kiếm hiện `LIMIT 50` và dùng `ILIKE '%q%'` (`index.js:668`) — với 3000+ từ nên chuyển sang full-text search (`tsvector` + GIN index)

---

## Thứ tự đề xuất

1. **P0.1 – P0.3** (nửa ngày) — sửa đường dẫn, xoá mật khẩu hard-code. Chặn mọi việc khác.
2. **P1.1 – P1.2** (nửa ngày) — sửa API_BASE, cho Express serve static. Chuẩn bị nền cho deploy.
3. **P1.4** (1 ngày) — migration. Bắt buộc phải có trước khi đổi schema ở P2/P3.
4. **P1.3, P1.5, P1.6** (1-2 ngày) — Docker + Render. Có bản deploy thật để test.
5. **P2** (2-3 ngày) — tag sổ tay. Trải nghiệm tốt lên rõ rệt, và làm sạch dữ liệu trước khi ngân hàng câu hỏi nhân bản mớ hỗn độn.
6. **P3** (4-6 ngày) — ngân hàng câu hỏi. Tính năng lớn nhất, xây trên nền đã sạch.
7. **P4** — nhặt dần, ưu tiên các lỗi bảo mật (route thiếu auth, rate limit).
