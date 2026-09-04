# `server/other-tools/`

Các script một lần dùng để nạp dữ liệu vào database và tiền xử lý file trong
`server/assets/`. **Không script nào chạy khi server khởi động** — chạy tay khi
cần.

## Quy ước chung

- Mọi đường dẫn dữ liệu đều tính từ `server/assets/`, giải bằng `__dirname` —
  chạy từ thư mục nào cũng được.
- Mọi script đọc `server/.env` (cũng giải bằng `__dirname`), không đọc `.env` ở
  thư mục hiện tại.
- Không hard-code thông tin database. Dùng `DB_HOST`, `DB_PORT`, `DB_NAME`,
  `DB_USER`, `DB_PASSWORD`.
- Các script import đều **idempotent** (`ON CONFLICT`) — chạy lại nhiều lần
  không nhân đôi dữ liệu.

Chạy qua npm script cho gọn (từ thư mục `server/`):

```bash
npm run seed:topics      # node other-tools/import-topics-and-sat-c1c2.js
npm run seed:magoosh     # node other-tools/import-magoosh.js
npm run seed:examples    # node other-tools/backfill-magoosh-examples.js
npm run seed:va          # node other-tools/import-va-b2c1-markdown.js 4
npm run seed:cambridge   # node other-tools/import-cleaned-csv.js
npm run seed:units       # node other-tools/import-vocab4ielts-units.js
npm run parse:questions  # node other-tools/parse-question-bank.js
```

## Thứ tự nạp dữ liệu từ DB trống

```bash
psql -U <user> -d <db> -f server/createdb.sql   # CẢNH BÁO: DROP SCHEMA public CASCADE
cd server
npm run seed:topics
npm run seed:magoosh
npm run seed:examples
npm run seed:va          # lặp lại với tham số 1, 2, 3 nếu muốn đủ 4 phần
npm run seed:cambridge   # cần chạy clean-cambridge-csv.py trước nếu chưa có file
npm run seed:units       # phải chạy SAU seed:cambridge
```

---

## Script nạp dữ liệu (có ghi vào DB)

### `import-topics-and-sat-c1c2.js`

| | |
|---|---|
| Nguồn | `assets/vocabularies.json` + `assets/va-c1c2-500-2023-2026.csv` |
| Tạo notebook | 7 sổ tay theo chủ đề (`Urbanization & Migration`, `Health & Lifestyle`, …) và `SAT C1-C2 500 (2023-2026)` |
| Chạy lại | An toàn |

Ghi đè bằng biến môi trường `VOCAB_FILE` / `SAT_VOCAB_FILE` nếu cần file khác.

### `import-magoosh.js`

| | |
|---|---|
| Nguồn | `assets/magoosh/*.json` (12 file) |
| Tạo notebook | Mỗi file 1 sổ tay: `Ielts Common 1`, `Ielts Easy`, `Ielts Hard 2`, … (topic `IELTS Magoosh`) |
| Chạy lại | An toàn |

Chỉ nạp `word` + `meanings`. Trường `example` để trống — dùng
`backfill-magoosh-examples.js` để điền.

> Tên sổ tay đang viết hoa sai (`Ielts` thay vì `IELTS`). Sẽ sửa ở P2 của
> [ROADMAP.md](../../ROADMAP.md).

### `backfill-magoosh-examples.js`

| | |
|---|---|
| Nguồn | `assets/magoosh/*.json` |
| Tác động | `UPDATE vocabulary SET example = ...` theo `word` |
| Chạy lại | An toàn |

Chạy **sau** `import-magoosh.js`. Không tạo sổ tay, chỉ điền ví dụ còn thiếu.

### `import-va-b2c1-markdown.js [part]`

| | |
|---|---|
| Nguồn | `assets/va-b2c1-1000-part<N>.md`, `N` = 1..4 (mặc định 4) |
| Tạo notebook | `SAT B2C1 1000 P<N>` (topic `SAT Vocabulary`) |
| Chạy lại | An toàn |

```bash
node other-tools/import-va-b2c1-markdown.js 1
node other-tools/import-va-b2c1-markdown.js 2
node other-tools/import-va-b2c1-markdown.js 3
node other-tools/import-va-b2c1-markdown.js 4
```

### `import-cleaned-csv.js`

| | |
|---|---|
| Nguồn | `assets/cleaned_vocabulary.csv` |
| Tạo notebook | `Cambridge IELTS Advanced` |
| Chạy lại | An toàn |

Cần `clean-cambridge-csv.py` chạy trước để sinh file CSV đã làm sạch.

### `import-vocab4ielts-units.js`

| | |
|---|---|
| Nguồn | `assets/vocab4ielts-units.json` |
| Tạo notebook | 20 sổ tay `vocab4ielt-1 Human nature` … `vocab4ielt-20 A matter of taste` (493 từ) |
| Chạy lại | An toàn |

Phải chạy **sau** `import-cleaned-csv.js`: 489/493 từ lấy từ sổ tay
`Cambridge IELTS Advanced`, script này chỉ phân loại lại chúng theo 20 unit. Từ nào
chưa có trong bảng `vocabulary` sẽ được tạo mới (chỉ có chữ, chưa có nghĩa) và
được liệt kê ở cuối — không bị bỏ im lặng.

> `assets/vocab4ielts-units.json` được **khôi phục từ database** ngày 2026-09-04, vì
> file gốc `cambridge-vocab4ielts-advanced.txt` chưa bao giờ được commit.

### `translate-api.js`

| | |
|---|---|
| Nguồn | Các từ trong DB chưa có `vietnamese_meaning` |
| Tác động | Gọi DeepL API, `UPDATE vocabulary SET vietnamese_meaning` theo batch 50 |
| Yêu cầu | `DEEPL_API_KEY` trong `server/.env` |

Tốn quota API — cân nhắc trước khi chạy.

### `addtostudy.py --total <N> [--user-id 1] [--nb-a 22] [--nb-b 8] [--chunk 5]`

Phân bổ từ xen kẽ giữa 2 sổ tay vào hàng đợi ôn tập của một user.

Script này gọi hàm SQL `add_vocab_to_review(user_id, notebook_id, limit)`. Hàm
này trước đây chỉ tồn tại trong database trên máy, không có trong repo — nay đã
được dump vào cuối `server/createdb.sql`, nên DB dựng mới từ repo sẽ có sẵn.

---

## Script tiền xử lý file (không đụng DB)

### `parse-question-bank.js`

`assets/440-wic-question.txt` → `assets/440-wic-question.json` (440 câu trắc
nghiệm). Chỉ convert text sang JSON, **không nạp vào database** — phần nạp DB
nằm ở P3 của ROADMAP.

> Dữ liệu hiện tại còn 11 câu thiếu options, 2 câu thiếu đáp án, ~30 câu bị
> phân loại `type` sai. Xem P3.0 trong ROADMAP.

### `clean-cambridge-csv.py`

`assets/cambridge-ielts-advanced.csv` → `assets/cleaned_vocabulary.csv`. Bóc
thẻ HTML, tách nghĩa Anh/Việt, từ đồng nghĩa, ví dụ. Chạy trước
`import-cleaned-csv.js`.

### `vocabmagoosh.py`

Scraper lấy flashcard từ `ielts.magoosh.com`, ghi ra
`assets/magoosh-scraped.json`. **Selector nhiều khả năng đã lỗi thời** — dữ
liệu Magoosh trong `assets/magoosh/` đã được thu thập sẵn, không cần chạy lại.
Cần `requests` và `beautifulsoup4`.

---

## Đã ngừng dùng

### `generate-vocab4ielts-sql.js` — LEGACY

Bản cũ sinh ra 20 sổ tay `vocab4ielt-*`: đọc
`assets/cambridge-vocab4ielts-advanced.txt` rồi xuất `assets/import_data.sql` để
bạn chạy tay bằng psql. Không dùng nữa vì 2 lý do:

1. File `.txt` đầu vào chưa bao giờ được commit — script không chạy được từ repo
   sạch. Dữ liệu đã được cứu từ DB sang `assets/vocab4ielts-units.json`.
2. Phần fallback trong SQL nó sinh ra **không hoạt động**. Trong Postgres, CTE có
   ghi dữ liệu (`new_vocabs`) không hiển thị với CTE khác đọc cùng bảng trong cùng
   1 câu lệnh, nên `all_vocabs` không thấy từ vừa insert. Từ mới bị JOIN loại bỏ
   thay vì rơi vào `vocab4ielts-other` — đó là lý do sổ tay đó có 0 từ.

Giữ lại phòng khi bạn tìm lại được file `.txt` gốc.

### `import_notebook.py` — DEPRECATED

Bản Python cũ của `import-topics-and-sat-c1c2.js`, nạp cùng
`assets/vocabularies.json` vào cùng các sổ tay chủ đề. Đã sửa để chạy được với
schema hiện tại, nhưng **không set `notebook_vocab.sort_order`** nên thứ tự học
sẽ không xác định. Dùng bản JS thay thế.
