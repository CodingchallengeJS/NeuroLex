## NeuroLex

Một môi trường học tập từ vựng thông minh dựa trên kỹ thuật Spaced Repetition

## Tính năng

- Hơn 3000 từ vựng được chia thành các sổ tay theo chủ đề để dễ học thuộc

- Kỹ thuật Spaced Repetion dựa trên Đường cong lãng quên (Forgetting Curve) của Hermann Ebbinghaus sẽ giúp nhắc bạn ôn tập từ ngay khi bạn sắp quên, giúp ghi nhớ từ vựng hiệu quả.

- Thống kê các từ vựng bạn đã học, đang ôn tập, và cần ôn tập.

## Tech

### Frontend
- React 18 + Vite
- React Router
- Tailwind CSS
- Recharts / ApexCharts (biểu đồ tiến độ)

### Backend
- Node.js
- Express.js
- PostgreSQL
- JWT Authentication
- bcrypt password hashing

### Hạ tầng
- Docker + Docker Compose
- Render Blueprint (`render.yaml`)

## Cài đặt

Có 3 cách chạy dự án. **Docker là cách nhanh nhất** — không cần cài Postgres, không
cần tạo database, không cần import dữ liệu bằng tay.

```bash
git clone https://github.com/CodingchallengeJS/NeuroLex.git
cd EnVocabLearner
```

---

## Cách 1: Chạy bằng Docker (khuyến nghị)

Yêu cầu: Docker Desktop (đã bao gồm Docker Compose).

```bash
docker compose up --build
```

Xong. Mở [http://localhost:8000](http://localhost:8000).

Lần đầu chạy, container sẽ tự động:

1. Dựng Postgres 16 trong một container riêng (dữ liệu lưu ở volume `pgdata`)
2. Chạy migration → tạo toàn bộ bảng + hàm `add_vocab_to_review`
3. Chạy seed → nạp **45 sổ tay / ~2800 từ** từ `server/assets/`
4. Khởi động Express, vừa phục vụ API vừa phục vụ bản build React

Bước 2 và 3 mất vài phút ở lần đầu. **Những lần sau chúng tự bỏ qua** (migration đã
ghi trong bảng `schema_migrations`, seed thấy đã có sổ tay thì không chạy lại).

### Các lệnh Docker hay dùng

```bash
docker compose up --build      # build và chạy
docker compose up -d           # chạy nền
docker compose logs -f app     # xem log
docker compose down            # dừng (vẫn giữ dữ liệu)
docker compose down -v         # dừng và XOÁ SẠCH database
```

### Tùy chỉnh

Mặc định dùng được ngay, nhưng bạn nên đặt secret thật. Tạo file `.env` ở
thư mục gốc (cùng cấp với `docker-compose.yml`):

```env
POSTGRES_DB=neurolex
POSTGRES_USER=neurolex
POSTGRES_PASSWORD=doi-mat-khau-nay

AUTH_PEPPER=chuoi-ngau-nhien-1
JWT_SECRET=chuoi-ngau-nhien-2

APP_HOST_PORT=8000     # đổi nếu 8000 đang bị chiếm
DB_HOST_PORT=5432      # đổi nếu 5432 đang bị chiếm
```

Các biến điều khiển quá trình khởi động:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `RUN_MIGRATIONS` | `true` | Chạy migration khi khởi động |
| `RUN_SEED` | `true` | Nạp từ vựng khi khởi động (tự bỏ qua nếu đã có sổ tay) |
| `FORCE_SEED` | `false` | Ép chạy lại toàn bộ importer dù đã có dữ liệu |

---

## Cách 2: Chạy trực tiếp trên máy (dev)

Dùng cách này khi bạn muốn sửa code và có hot reload.

### 2.1 Biến môi trường

```bash
cp server/.env.example server/.env
```

Rồi sửa `server/.env` cho khớp với Postgres trên máy bạn. File này đã nằm trong
`.gitignore` — **đừng bao giờ commit nó, và đừng viết thẳng mật khẩu vào code.**

### 2.2 Tạo và nạp database

Tự tạo một database trống trong Postgres trước (ví dụ `createdb envocab`), sau đó:

```bash
cd server
npm install
npm run db:setup     # = npm run migrate && npm run seed
```

- `npm run migrate` — tạo bảng theo `server/migrations/`. An toàn khi chạy lại, và
  **không xoá gì cả**. Chạy được cả trên database đã có dữ liệu từ trước.
- `npm run seed` — nạp toàn bộ từ vựng. Tự bỏ qua nếu đã có sổ tay.

> ⚠️ `server/createdb.sql` **không còn là cách dựng DB nữa**. Nó mở đầu bằng
> `DROP SCHEMA public CASCADE` — chỉ dùng khi bạn cố tình muốn xoá sạch và làm lại
> từ đầu. Dùng `npm run migrate` cho mọi trường hợp bình thường.

Muốn nạp lẻ từng bộ dữ liệu thì xem
[`server/other-tools/README.md`](server/other-tools/README.md).

### 2.3 Chạy backend

```bash
cd server
npm run dev          # http://localhost:8000
```

### 2.4 Chạy frontend

Mở terminal thứ hai:

```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

Frontend gọi API qua đường dẫn tương đối `/api`; Vite tự proxy sang backend ở
`http://localhost:8000`. Nếu backend chạy cổng khác, đặt `VITE_DEV_API_TARGET`.

Truy cập từ máy khác (LAN, Tailscale...) thì thêm hostname vào `client/.env`:

```env
VITE_ALLOWED_HOSTS=laptop-cua-ban.dtth.ts
```

---

## Cách 3: Deploy lên Render

**Quan trọng:** tạo một Web Service trên Render sẽ **không** tự tạo database. Phải
dùng **Blueprint** thì Render mới dựng cả web service lẫn Postgres cùng lúc. Repo này
đã có sẵn file [`render.yaml`](render.yaml) làm việc đó.

1. Push code lên GitHub.
2. Trên Render: **New → Blueprint** → chọn repo này.
3. Render đọc `render.yaml` và tạo:
   - Postgres `neurolex-db`
   - Web service `neurolex` (build từ `Dockerfile`)
   - `DATABASE_URL` được nối sẵn giữa hai bên
   - `AUTH_PEPPER` và `JWT_SECRET` được sinh ngẫu nhiên
4. Bấm **Apply**.

Lần deploy đầu tiên, container tự chạy migration rồi seed, nên **schema và toàn bộ
sổ tay tự có sẵn**, không cần chạy `psql` tay. Các lần deploy sau seed tự bỏ qua.

Kiểm tra bằng `https://<tên-app>.onrender.com/api/health` — trả về `{"ok":true}`.

### Lưu ý với gói free của Render

- Web service **ngủ sau 15 phút** không có request → lần truy cập sau đó chậm ~30-60s.
- Postgres free **hết hạn sau 90 ngày**. Nhớ `pg_dump` định kỳ nếu có dữ liệu thật.
- Build Docker trên gói free khá chậm (vài phút).

---

### Vocabulary data update

`npm run seed:topics` imports both `server/assets/vocabularies.json` and
`server/assets/va-c1c2-500-2023-2026.csv`. The CSV is added as the notebook
`SAT C1-C2 500 (2023-2026)` and fills the detailed fields
`english_meaning`, `vietnamese_meaning`, and `synonyms`. Its CSV `id`
column is used as the notebook order, from highest frequency to lowest.
