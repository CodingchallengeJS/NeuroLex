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
npm run seed:connectives # node other-tools/import-connectives.js
npm run seed:tags        # node other-tools/import-tags.js
npm run seed:wordtags    # node other-tools/import-vocab-tags.js
npm run seed:questions   # node other-tools/import-question-bank.js
npm run export:sync      # node other-tools/export-sync.js
npm run parse:questions  # node other-tools/parse-question-bank.js
```

## Thứ tự nạp dữ liệu từ DB trống

```bash
cd server && npm run db:setup   # migrate + seed, không xoá gì
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

### `import-question-bank.js`

| | |
|---|---|
| Nguồn | `assets/440-wic-question.json` (+ `assets/lemma-overrides.json`) |
| Tạo | 427 câu hỏi trong `questions`, liên kết tới từ vựng qua `question_vocab` |
| Chạy lại | An toàn (xây lại liên kết của từng câu) |

Bỏ qua 13 câu không dùng được (11 câu thiếu đáp án lựa chọn, 2 câu thiếu đáp án
đúng). Liên kết cả **từ được hỏi** lẫn **4 phương án**: chỉ dùng từ được hỏi thì
liên kết được 186 câu, thêm phương án thì lên 315. Dạng biến cách (`prized`,
`overtaken`) được đưa về dạng nguyên thể bằng `lib/lemma.js`.

Từ nào không khớp sẽ được báo ra chứ **không tự tạo mới** — phần lớn là từ
trung cấp không thuộc danh sách C1-C2. Muốn sửa tay thì thêm vào
`assets/lemma-overrides.json`.

### `export-sync.js [--reference-db <db>] [--out <file>]`

Xuất nội dung từ DB **hiện tại** ra một file SQL chạy lại được, để đồng bộ sang
bản deploy (Render).

```bash
npm run export:sync                                    # xuất toàn bộ
npm run export:sync -- --reference-db neurolex_pristine # chỉ xuất phần đã sửa tay
```

Xuất: `tags`, `notebook_tags`, `vocab_tags`, tên/slug sổ tay, và các trường nghĩa
của `vocabulary` (nơi chứa bản dịch DeepL bạn sửa tay — importer không tái tạo được).

**Không** xuất: user, mật khẩu, tiến độ ôn tập, lịch sử trả lời câu hỏi.

File sinh ra có sẵn `SET client_encoding = 'UTF8';` ở đầu. Trên Windows, psql
mặc định dùng codepage của console (WIN1252) nên sẽ đọc sai phần tiếng Việt và
ký hiệu IPA rồi báo lỗi `character with byte sequence 0x8f`. Dòng SET đó khắc
phục, không cần đặt biến môi trường gì thêm.

Mọi thứ được khớp theo **khoá tự nhiên** (`word`, `slug`), không phải id — vì id
trên Render do seed ở đó sinh ra, không trùng với máy bạn.

`--reference-db` trỏ tới một DB vừa seed sạch trên cùng server; khi có, chỉ những
dòng `vocabulary` **khác** bản seed mới được xuất. Tạo bằng:

```bash
createdb neurolex_pristine
DATABASE_URL=postgres://user:pass@localhost:5432/neurolex_pristine npm run db:setup
```

### `sync-user-progress.js <userIdLocal> <userIdRemote> [--apply] [--target=render|neon]`

Gộp tiến độ ôn tập (`user_vocab_progress`) của **một** user từ DB máy bạn sang
bản deploy.

```bash
npm run sync:progress -- 1 1              # xem trước, không ghi gì
npm run sync:progress -- 1 1 --apply      # ghi thật
npm run sync:progress -- 1 1 --target=neon --apply
```

Luật gộp khi cả hai bên đều có từ đó:

| | |
|---|---|
| `repetition_level` | lấy **cấp cao hơn** — giữ mức nhớ tốt nhất |
| `next_review_at` | lấy **ngày xa hơn** — giữ khoảng cách đã đạt được |

Hai giá trị lấy độc lập nhau. Các cột còn lại đi theo: `interval_days` lấy từ
bên thắng về cấp độ, `correct_streak` / `total_reviews` lấy max (không cộng, vì
DB deploy thường đã là bản sao của DB local — cộng vào sẽ đếm trùng),
`last_reviewed_at` lấy mốc gần nhất, `created_at` lấy sớm nhất, `mastered` tính
lại từ cấp độ thắng.

**Khớp theo `vocabulary.word`, không theo `vocab_id`.** Hai DB được seed riêng
nên id lệch nhau: đo trên đúng cặp DB này, chỉ **348 / 2944** id trỏ về cùng một
từ. Chép thẳng `vocab_id` sẽ gắn tiến độ của bạn vào những từ hoàn toàn khác.

Chỉ **thêm hoặc nâng**, không bao giờ hạ cấp hay xoá dòng nào. Từ nào không có
trong `vocabulary` phía đích sẽ bị bỏ qua và liệt kê ra (chạy `sync-content.sql`
trước nếu bạn kỳ vọng nó phải có).

Phần gộp chạy bằng `GREATEST`/`LEAST` ngay trong 1 transaction trên DB đích, nên
nếu bạn vừa ôn xong trên web giữa lúc sync thì kết quả đó cũng được gộp vào chứ
không bị ghi đè. Chạy lại nhiều lần không đổi gì thêm.

Phía local đọc từ `DB_*` chứ **không** dùng `DATABASE_URL` — vì trong `.env` của
dự án này `DATABASE_URL` đang trỏ tới bản deploy.

### `sync-render-to-neon.js [--apply]`

Chép **toàn bộ** DB Render đè lên Neon (Neon chỉ là bản sao dùng để thử).

```bash
npm run sync:neon             # xem trước
npm run sync:neon -- --apply  # xoá Neon và chép lại
```

Đọc `RENDER_DATABASE_URL` và `DATABASE_URL_UNPOOLED` trong `server/.env`. Nếu
chỉ có URL pooled, tool tự bỏ `-pooler` để dùng endpoint trực tiếp — pgbouncer
không chịu được thao tác restore. Việc nặng do `copy-database.js` làm (đối chiếu
số dòng từng bảng sau khi chép). Không bao giờ chép ngược Neon → Render.

### `translate-api.js`

| | |
|---|---|
| Nguồn | Các từ trong DB chưa có `vietnamese_meaning` |
| Tác động | Gọi DeepL API, `UPDATE vocabulary SET vietnamese_meaning` theo batch 50 |
| Yêu cầu | `DEEPL_API_KEY` trong `server/.env` |

Tốn quota API — cân nhắc trước khi chạy.

### `grant-admin.js <email> [--revoke]`

Cấp / thu hồi quyền **maintainer** — quyền sửa từ vựng dùng chung
(`PUT /api/vocabs/:id`).

```bash
npm run admin -- you@example.com            # cấp quyền
npm run admin -- you@example.com --revoke   # thu hồi
npm run admin -- --list                     # xem ai đang có quyền
```

Trước đây quyền này gắn cứng vào `user_id === 1` — tức là **người đăng ký đầu
tiên**. Ở máy bạn thì đúng, nhưng trên bản deploy mới (DB trống) thì ai đăng ký
trước sẽ thành id 1. Giờ dùng cột `users.is_admin`, và biến `ADMIN_EMAIL` sẽ tự
cấp quyền cho email đó lúc đăng ký.

### `addtostudy.py --total <N> [--user-id 1] [--nb-a 22] [--nb-b 8] [--chunk 5]`

Phân bổ từ xen kẽ giữa 2 sổ tay vào hàng đợi ôn tập của một user.

Script này gọi hàm SQL `add_vocab_to_review(user_id, notebook_id, limit)`. Hàm
này trước đây chỉ tồn tại trong database trên máy, không có trong repo — nay đã
được dump vào cuối `server/reset-dev-db.sql`, nên DB dựng mới từ repo sẽ có sẵn.

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
