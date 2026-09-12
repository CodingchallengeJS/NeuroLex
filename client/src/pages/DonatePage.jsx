import { Link } from 'react-router-dom';

// The VietQR image lives in client/src/assets as QR.jpg (png/webp also work).
// A glob instead of a plain import so a missing file shows a placeholder rather
// than failing `vite build`, which the Docker image runs on every deploy.
// Linux is case-sensitive: the file must be named exactly "QR", not "qr".
const qrImages = import.meta.glob('../assets/QR.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });
const [qrPath, qrSrc = null] = Object.entries(qrImages)[0] || [];
// From the file name, not the URL: Vite inlines images under 4kb as data: URLs,
// which have no extension to read.
const qrExtension = qrPath ? qrPath.split('.').pop() : 'jpg';

export default function DonatePage() {
  return (
    <div className="info-page">
      <section className="info-hero">
        <h1 className="hero-title">Ủng hộ NeuroLex</h1>
        <p className="hero-subtitle">
          NeuroLex miễn phí và không có quảng cáo. Nếu trang giúp ích cho việc học của bạn, một khoản ủng
          hộ nhỏ sẽ giúp duy trì máy chủ, cơ sở dữ liệu và phát triển thêm tính năng.
        </p>
      </section>

      <section className="card donate-card">
        {qrSrc ? (
          <div className="donate-qr">
            <img src={qrSrc} alt="Mã VietQR để ủng hộ NeuroLex" />
          </div>
        ) : (
          <div className="donate-qr is-empty">
            <i className="fa-solid fa-qrcode"></i>
            <span>Mã QR đang được cập nhật</span>
          </div>
        )}

        <div className="info-section">
          <h2><i className="fa-solid fa-mobile-screen-button"></i> Cách chuyển khoản</h2>
          <ol className="info-steps">
            <li><span>Mở ứng dụng ngân hàng hoặc ví điện tử có hỗ trợ <strong>VietQR</strong>.</span></li>
            <li><span>Chọn <strong>Quét mã QR</strong> và hướng camera vào mã bên cạnh.</span></li>
            <li><span>Nhập số tiền tuỳ tâm, kiểm tra tên người nhận rồi xác nhận.</span></li>
          </ol>

          {qrSrc && (
            <>
              <p className="donate-note">
                Đang xem trên điện thoại? Tải ảnh về, rồi trong ứng dụng ngân hàng chọn quét mã từ ảnh
                trong thư viện.
              </p>
              <a className="btn-outline btn-sm donate-download" href={qrSrc} download={`NeuroLex-VietQR.${qrExtension}`}>
                <i className="fa-solid fa-download"></i> Tải ảnh QR
              </a>
            </>
          )}

          <p className="donate-note">
            Mọi khoản ủng hộ đều hoàn toàn tự nguyện và không mở khoá thêm tính năng nào. Cảm ơn bạn đã
            đồng hành cùng NeuroLex!
          </p>
        </div>
      </section>

      <div className="info-actions">
        <Link to="/notebooks" className="btn-primary"><i className="fa-solid fa-play"></i> Tiếp tục học</Link>
        <Link to="/about" className="btn-outline"><i className="fa-solid fa-circle-info"></i> Về NeuroLex</Link>
      </div>
    </div>
  );
}
