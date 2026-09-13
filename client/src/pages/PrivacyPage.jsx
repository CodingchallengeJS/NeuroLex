import { Link } from 'react-router-dom';

// Google's API terms require a privacy policy for apps built on its APIs. Keep
// this page in step with the code: it names the storage keys and hosts the app
// actually uses, so an edit there that changes where data goes belongs here too.
const BROWSER_STORAGE = [
  { name: 'evl_access_token', what: 'Phiên đăng nhập (nếu bạn đăng nhập)', where: 'localStorage' },
  { name: 'evl_theme_mode', what: 'Chế độ giao diện sáng/tối', where: 'localStorage' },
  { name: 'evl_guest_progress_v1', what: 'Tiến độ học khi chưa đăng nhập', where: 'localStorage' },
  { name: 'evl_gemini_api_key', what: 'Khoá API Gemini của bạn (nếu dùng trợ lý AI)', where: 'sessionStorage, hoặc localStorage nếu bạn chọn ghi nhớ' },
  { name: 'evl_ai_settings_v1', what: 'Model đã chọn và xác nhận đủ 18 tuổi', where: 'localStorage' }
];

export default function PrivacyPage() {
  return (
    <div className="info-page">
      <section className="info-hero">
        <h1 className="hero-title">Quyền riêng tư</h1>
        <p className="hero-subtitle">
          NeuroLex thu thập ít nhất có thể và nói rõ từng thứ đi đâu. Cập nhật lần cuối: 13/09/2026.
        </p>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-list-check"></i> Tóm tắt</h2>
        <ul className="info-list">
          <li>Không quảng cáo, không công cụ theo dõi hay phân tích hành vi.</li>
          <li>Khi có tài khoản: NeuroLex lưu tên đăng nhập, email, mật khẩu đã được băm và tiến độ học của bạn.</li>
          <li>Khi chưa đăng nhập: tiến độ chỉ nằm trong trình duyệt của bạn.</li>
          <li>
            Trợ lý AI dùng khoá Gemini của chính bạn. <strong>Khoá và nội dung trò chuyện đi thẳng từ trình duyệt tới
            Google, không qua máy chủ NeuroLex.</strong>
          </li>
        </ul>
      </section>

      <section className="card info-section">
        <h2><i className="fa-regular fa-user"></i> Tài khoản và tiến độ học</h2>
        <p>
          Khi đăng ký, NeuroLex lưu tên đăng nhập, email và mật khẩu. Mật khẩu được băm bằng bcrypt trước khi lưu,
          không bao giờ lưu ở dạng gốc. Tiến độ học gồm các từ bạn đã học, cấp độ và lịch ôn của từng từ, vị trí
          đang học trong mỗi sổ tay, các câu hỏi đã làm và sổ tay bạn tự tạo.
        </p>
        <p>
          Nếu bạn học khi chưa đăng nhập, tiến độ được lưu trong trình duyệt. Khi đăng nhập, phần tiến độ đó được
          gửi lên để gộp vào tài khoản rồi xoá khỏi trình duyệt.
        </p>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-database"></i> Dữ liệu lưu trong trình duyệt</h2>
        <div className="srs-ladder">
          <table>
            <thead>
              <tr><th>Tên</th><th>Nội dung</th><th>Nơi lưu</th></tr>
            </thead>
            <tbody>
              {BROWSER_STORAGE.map((row) => (
                <tr key={row.name}><td><code>{row.name}</code></td><td>{row.what}</td><td>{row.where}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="info-footnote">
          sessionStorage bị xoá khi bạn đóng tab. Bạn có thể xoá tất cả bằng cách xoá dữ liệu trang web trong cài
          đặt trình duyệt.
        </p>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-wand-magic-sparkles"></i> Trợ lý AI và khoá API của bạn</h2>
        <ul className="info-list">
          <li>
            Khoá API chỉ được lưu trong trình duyệt của bạn và chỉ được gửi tới <code>generativelanguage.googleapis.com</code>{' '}
            (Gemini API của Google), trong header của yêu cầu. Máy chủ NeuroLex không nhận, không lưu và không ghi log khoá.
          </li>
          <li>
            Trang web gửi kèm chính sách bảo mật nội dung (Content-Security-Policy) yêu cầu trình duyệt chỉ cho phép mã
            trên trang kết nối tới NeuroLex và Gemini API, không tới bất kỳ địa chỉ nào khác.
          </li>
          <li>
            Nội dung trò chuyện (câu bạn hỏi và từ vựng hoặc câu hỏi bạn đính kèm) được gửi thẳng tới Google. NeuroLex
            không lưu cuộc trò chuyện; lịch sử mất khi bạn tải lại trang.
          </li>
          <li>
            Google xử lý nội dung đó theo{' '}
            <a className="info-link" href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Điều khoản Gemini API</a>{' '}
            và{' '}
            <a className="info-link" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Chính sách quyền riêng tư của Google</a>.
            Với khoá miễn phí, Google dùng nội dung để cải thiện sản phẩm và người đánh giá có thể đọc nó, vì vậy
            đừng gửi thông tin cá nhân.
          </li>
          <li>Theo điều khoản của Google, người tạo và dùng khoá phải đủ 18 tuổi, nên trợ lý chỉ dành cho người đủ 18 tuổi.</li>
          <li>
            Bạn có thể xoá khoá bất cứ lúc nào trong phần cài đặt của trợ lý (biểu tượng chìa khoá), hoặc thu hồi khoá
            trong Google AI Studio.
          </li>
        </ul>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-server"></i> Dịch vụ bên thứ ba</h2>
        <ul className="info-list">
          <li>
            Máy chủ và cơ sở dữ liệu chạy trên nhà cung cấp hạ tầng (Render, Neon). Như mọi dịch vụ web, họ có thể ghi
            nhật ký kỹ thuật như địa chỉ IP.
          </li>
          <li>
            Phông chữ và biểu tượng được tải từ Google Fonts và cdnjs (Font Awesome). Trình duyệt tải trực tiếp nên
            các dịch vụ này thấy địa chỉ IP của bạn.
          </li>
          <li>Máy chủ tạm ghi nhớ địa chỉ IP trong bộ nhớ để giới hạn số lần đăng nhập, chống dò mật khẩu.</li>
          <li>Tính năng phát âm dùng giọng đọc có sẵn của trình duyệt; một số trình duyệt dùng giọng đọc trực tuyến.</li>
        </ul>
      </section>

      <section className="card info-section">
        <h2><i className="fa-solid fa-envelope-open-text"></i> Quyền của bạn</h2>
        <p>
          Hiện chưa có nút xoá tài khoản trong ứng dụng. Để yêu cầu xoá tài khoản và dữ liệu học, hãy liên hệ qua{' '}
          <a className="info-link" href="https://github.com/CodingchallengeJS/NeuroLex/issues" target="_blank" rel="noreferrer">GitHub</a>.
          Toàn bộ mã nguồn được công khai để bạn tự kiểm tra những gì viết ở trang này.
        </p>
      </section>

      <div className="info-actions">
        <Link to="/about" className="btn-outline"><i className="fa-solid fa-circle-info"></i> Về NeuroLex</Link>
      </div>
    </div>
  );
}
