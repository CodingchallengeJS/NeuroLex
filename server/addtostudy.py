import os
import argparse
import psycopg2
from dotenv import load_dotenv

def add_alternating_vocabs(conn, user_id: int, notebook_a: int, notebook_b: int, chunk_size: int, total_n: int):
    """
    Hàm điều phối thêm từ vựng xen kẽ từ hai sổ tay vào tiến trình học của người dùng.
    Sử dụng Stored Function 'add_vocab_to_review' đã được định nghĩa trong PostgreSQL.
    """
    added_words = 0
    is_notebook_a_turn = True

    try:
        # Khởi tạo cursor để thực thi truy vấn
        with conn.cursor() as cursor:
            while added_words < total_n:
                # Tính toán số lượng từ tối đa có thể thêm trong lượt này
                remaining_words = total_n - added_words
                current_limit = min(chunk_size, remaining_words)
                
                # Xác định định danh (ID) của sổ tay cho lượt thực thi hiện tại
                current_notebook_id = notebook_a if is_notebook_a_turn else notebook_b
                
                # Gọi Stored Function trong cơ sở dữ liệu
                cursor.execute(
                    "SELECT add_vocab_to_review(%s, %s, %s);",
                    (user_id, current_notebook_id, current_limit)
                )
                
                # Cập nhật trạng thái vòng lặp
                added_words += current_limit
                is_notebook_a_turn = not is_notebook_a_turn
        
        # Xác nhận giao dịch (Commit transaction)
        conn.commit()
        print(f"[SUCCESS] Đã phân bổ thành công {added_words} từ vựng xen kẽ cho User {user_id}.")
        
    except (Exception, psycopg2.DatabaseError) as e:
        # Hoàn tác giao dịch (Rollback) nếu xảy ra ngoại lệ
        conn.rollback()
        print(f"[ERROR] Lỗi trong quá trình phân bổ từ vựng: {e}")
        raise e

def main():
    # 1. Nạp biến môi trường từ file .env vào hệ thống
    load_dotenv()

    # 2. Thiết lập cơ chế phân tích tham số dòng lệnh (CLI Arguments)
    parser = argparse.ArgumentParser(description="Script thêm từ vựng xen kẽ từ hai Notebook cho người dùng.")
    
    # Khai báo các tham số đầu vào
    parser.add_argument("--user-id", type=int, default=1, help="Định danh của người dùng (Mặc định: 1)")
    parser.add_argument("--nb-a", type=int, default=22, help="Định danh của Notebook thứ nhất (Mặc định: 22)")
    parser.add_argument("--nb-b", type=int, default=8, help="Định danh của Notebook thứ hai (Mặc định: 8)")
    parser.add_argument("--chunk", type=int, default=5, help="Kích thước khối lượng từ luân phiên (Mặc định: 5)")
    parser.add_argument("--total", type=int, required=True, help="Tổng số lượng từ vựng cần phân bổ (Bắt buộc)")
    
    args = parser.parse_args()

    conn = None
    try:
        # 3. Khởi tạo kết nối đến PostgreSQL thông qua các biến môi trường
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
        # 5. Đóng kết nối an toàn để giải phóng tài nguyên
        if conn is not None:
            conn.close()

if __name__ == "__main__":
    main()