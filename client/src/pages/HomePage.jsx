import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="home-container">
      <div className="hero-section">
        <h1 className="hero-title">IELTS Vocabularies Learner</h1>
        <p className="hero-subtitle">Mở rộng vốn từ vựng của bạn một cách thông minh và hiệu quả với hệ thống Spaced Repetition tiên tiến.</p>
        <Link to="/notebooks" className="btn-primary hero-btn">Bắt đầu học ngay</Link>
      </div>

      <div className="features-grid">
        <div className="feature-card card">
          <div className="feature-icon"><i className="fa-solid fa-brain"></i></div>
          <h3>Spaced Repetition</h3>
          <p>Thuật toán lặp lại ngắt quãng giúp bạn ghi nhớ từ vựng lâu hơn, chỉ ôn tập những từ bạn sắp quên.</p>
        </div>
        <div className="feature-card card">
          <div className="feature-icon"><i className="fa-solid fa-book"></i></div>
          <h3>Hệ thống sổ tay</h3>
          <p>Quản lý từ vựng theo từng chủ đề hoặc kỳ thi với hệ thống sổ tay thông minh, dễ dàng theo dõi tiến độ.</p>
        </div>
        <div className="feature-card card">
          <div className="feature-icon"><i className="fa-solid fa-gamepad"></i></div>
          <h3>Học qua trắc nghiệm</h3>
          <p>Ghi nhớ sâu sắc hơn qua các bài kiểm tra trắc nghiệm đa chiều (Anh-Việt, Việt-Anh) thay vì chỉ đọc nhẩm.</p>
        </div>
      </div>
    </div>
  );
}
