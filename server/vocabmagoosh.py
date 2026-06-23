import requests
from bs4 import BeautifulSoup
import json

def scrape_magoosh_ielts():
    # URL của Magoosh IELTS Flashcards (hoặc các trang tương tự)
    url = "https://ielts.magoosh.com/flashcards/vocabulary/ielts-common-1"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print("Không thể truy cập Magoosh.")
        return {}

    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Cấu trúc này có thể thay đổi tùy theo layout của Magoosh tại thời điểm chạy
    # Đây là logic giả định dựa trên cấu trúc thẻ flashcard phổ biến
    new_vocab = {}
    cards = soup.find_all('div', class_='flashcard') # Kiểm tra class thực tế trên web
    
    for card in cards[:10]: # Lấy ví dụ 10 từ đầu tiên
        word = card.find('div', class_='word').text.strip()
        meaning = card.find('div', class_='definition').text.strip()
        # Magoosh thường không có phiên âm ngay trên card chính, bạn có thể bổ sung sau
        new_vocab[word] = {
            "pronunciation": "/.../", 
            "meaning": meaning 
        }
    
    return new_vocab

def update_json_data(new_topics_dict):
    # Giả sử file cũ của bạn tên là data.json
    try:
        with open('data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {}

    # Thêm các chủ đề mới vào
    data.update(new_topics_dict)

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print("Đã cập nhật dữ liệu thành công!")

# Thực thi
if __name__ == "__main__":
    # Bạn có thể tạo danh sách 6 chủ đề mới ở đây
    magoosh_data = scrape_magoosh_ielts()
    
    formatted_data = {
        "Magoosh Common Words": magoosh_data,
        # Bạn có thể lặp lại hàm scrape cho các level khác của Magoosh (Hard, Very Hard...)
    }
    
    update_json_data(formatted_data)