This is how i created database:

envocab=# CREATE TABLE users (
envocab(#     id BIGSERIAL PRIMARY KEY,
envocab(#     email VARCHAR(255) UNIQUE NOT NULL,
envocab(#     password_hash TEXT NOT NULL,
envocab(#     created_at TIMESTAMP DEFAULT NOW()
envocab(# );
CREATE TABLE
envocab=# CREATE TABLE notebooks (
envocab(#     id BIGSERIAL PRIMARY KEY,
envocab(#     title VARCHAR(255) NOT NULL,
envocab(#     topic VARCHAR(255) NOT NULL,
envocab(#     difficulty VARCHAR(50),
envocab(#     created_at TIMESTAMP DEFAULT NOW()
envocab(# );
CREATE TABLE
envocab=# CREATE TABLE vocabulary (
envocab(#     id BIGSERIAL PRIMARY KEY,
envocab(#     word VARCHAR(255) UNIQUE NOT NULL,
envocab(#     meaning TEXT NOT NULL,
envocab(#     phonetic VARCHAR(255),
envocab(#     created_at TIMESTAMP DEFAULT NOW()
envocab(# );
CREATE TABLE
envocab=# CREATE TABLE notebook_vocab (
envocab(#     notebook_id BIGINT REFERENCES notebooks(id) ON DELETE CASCADE,
envocab(#     vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
envocab(#     PRIMARY KEY (notebook_id, vocab_id)
envocab(# );
CREATE TABLE
envocab=# CREATE TABLE user_vocab_progress (
envocab(#     user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
envocab(#     vocab_id BIGINT REFERENCES vocabulary(id) ON DELETE CASCADE,
envocab(#
envocab(#     repetition_level INTEGER DEFAULT 0,
envocab(#     interval_days INTEGER DEFAULT 0,
envocab(#
envocab(#     next_review_at TIMESTAMP NOT NULL,
envocab(#     last_reviewed_at TIMESTAMP,
envocab(#
envocab(#     correct_streak INTEGER DEFAULT 0,
envocab(#     total_reviews INTEGER DEFAULT 0,
envocab(#
envocab(#     PRIMARY KEY (user_id, vocab_id)
envocab(# );
CREATE TABLE
envocab=# CREATE INDEX idx_user_review_time
envocab-# ON user_vocab_progress(user_id, next_review_at);
CREATE INDEX
envocab=#