import os
import argparse
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

def add_alternating_vocabs(conn, user_id: int, notebook_a: int, notebook_b: int, chunk_size: int, total_n: int):
    added_words = 0
    is_notebook_a_turn = True

    try:
        with conn.cursor() as cursor:
            while added_words < total_n:
                remaining_words = total_n - added_words
                current_limit = min(chunk_size, remaining_words)
                
                current_notebook_id = notebook_a if is_notebook_a_turn else notebook_b
                
                cursor.execute(
                    "SELECT add_vocab_to_review(%s, %s, %s);",
                    (user_id, current_notebook_id, current_limit)
                )
                
                added_words += current_limit
                is_notebook_a_turn = not is_notebook_a_turn
        
        conn.commit()
        print(f"[SUCCESS] Đã phân bổ thành công {added_words} từ vựng xen kẽ cho User {user_id}.")
        
    except (Exception, psycopg2.DatabaseError) as e:
        conn.rollback()
        print(f"[ERROR] Lỗi trong quá trình phân bổ từ vựng: {e}")
        raise e

def main():
    load_dotenv(dotenv_path=BASE_DIR / ".." / ".env")

    parser = argparse.ArgumentParser(description="Script thêm từ vựng xen kẽ từ hai Notebook cho người dùng.")
    
    parser.add_argument("--user-id", type=int, default=1, help="Định danh của người dùng (Mặc định: 1)")
    parser.add_argument("--nb-a", type=int, default=22, help="Định danh của Notebook thứ nhất (Mặc định: 22)")
    parser.add_argument("--nb-b", type=int, default=8, help="Định danh của Notebook thứ hai (Mặc định: 8)")
    parser.add_argument("--chunk", type=int, default=5, help="Kích thước khối lượng từ luân phiên (Mặc định: 5)")
    parser.add_argument("--total", type=int, required=True, help="Tổng số lượng từ vựng cần phân bổ (Bắt buộc)")
    
    args = parser.parse_args()

    conn = None
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT", "5432"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD")
        )
        
        # 4. Thực thi logic nghiệp vụ chính
        add_alternating_vocabs(
            conn=conn,
            user_id=args.user_id,
            notebook_a=args.nb_a,
            notebook_b=args.nb_b,
            chunk_size=args.chunk,
            total_n=args.total
        )
        
    except Exception as e:
        print(f"[FATAL] Lỗi hệ thống: {e}")
    finally:
        if conn is not None:
            conn.close()

if __name__ == "__main__":
    main()