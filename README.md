## NeuroLex

Một môi trường học tập từ vựng thông minh dựa trên kỹ thuật Spaced Repetition

## Tính năng

- Hơn 1000 từ vựng được chia thành các sổ tay theo chủ đề để dễ học thuộc

- Kỹ thuật Spaced Repetion dựa trên Đường cong lãng quên (Forgetting Curve) của Hermann Ebbinghaus sẽ giúp nhắc bạn ôn tập từ ngay khi bạn sắp quên, giúp ghi nhớ từ vựng hiệu quả.

- Thống kê các từ vựng bạn đã học, đang ôn tập, và cần ôn tập.

## Tech

### Frontend
- HTML
- CSS (custom UI design)
- Vanilla JavaScript

### Backend
- Node.js
- Express.js
- PostgreSQL
- JWT Authentication
- bcrypt password hashing

## Cài đặt

### Clone Repository

```bash
git clone https://github.com/CodingchallengeJS/NeuroLex.git
cd EnVocabLearner
```

### Setup Database

Bạn trước đó cần có sẵn một database trống trong postgreSQL.

Khi có rồi thì dùng lệnh sau để tạo schema cần thiết trong database.
```
psql -U your_user -d your_db -f server/sql/create_schema.sql
```

### Tạo biến môi trường

Trong thư mục `server/` tạo file `.env`:
```env
DB_HOST=localhost
DB_PORT=your_port
DB_NAME=your_db
DB_USER=your_user
DB_PASSWORD=your_password

AUTH_PEPPER=some-random-secret-text
BCRYPT_ROUNDS=10
JWT_SECRET=some-random-super-secret-text
JWT_EXPIRES_IN=7d

PORT=8000
```

### Chạy server
```bash
cd server
npm install
```
Còn lệnh này để import dữ liệu từ vựng vào database, chỉ cần chạy 1 lần duy nhất trừ khi bạn cập nhật file vocabularies.json.
```bash
node import_vocab.js
```

Để khởi động server:
```bash
node index.js
```

Khi ấy server sẽ chạy ở `http://localhost:8000` (cũng có thể là port khác tùy theo biến PORT trong file .env của bạn)

### Chạy frontend
Bình thường bạn chỉ cần bấm nút `Go live` nếu bạn đã cài extension `Live Server` trong vscode, khi ấy đường link web thường là [http://127.0.0.1:5500/client](http://127.0.0.1:5500/client)

Bạn cũng có thể dùng một web tĩnh đơn giản
```bash
npx http-server client -p 8080
```
