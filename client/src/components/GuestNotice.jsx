import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useGuestProgress, guestWordCount, guestStorageOk } from '../lib/guestStore';

// The standing offer to a guest: learning works without an account, but the
// progress only lives in this browser until they sign in.
export default function GuestNotice({ compact = false }) {
  const { user, loading, openAuth } = useContext(AuthContext);
  const words = guestWordCount(useGuestProgress());

  // `loading` = a saved session is still being checked; do not flash the
  // guest prompt at someone who is about to be signed in.
  if (loading || user) return null;

  const where = !guestStorageOk()
    ? 'Trình duyệt đang chặn lưu trữ, nên tiến độ sẽ mất khi tải lại trang.'
    : words > 0
      ? `Tiến độ ${words} từ đang được lưu trên trình duyệt này.`
      : 'Bạn có thể học ngay, tiến độ được lưu trên trình duyệt này.';

  return (
    <div className={`guest-notice ${compact ? 'compact' : ''}`}>
      <div className="guest-notice-text">
        {!compact && (
          <strong className="guest-notice-title">
            <i className="fa-regular fa-user"></i> Đang học với tư cách khách
          </strong>
        )}
        <span>{where} Đăng nhập để lưu vào tài khoản và học tiếp trên mọi thiết bị.</span>
      </div>
      <button className="btn-primary btn-sm" onClick={openAuth}>
        <i className="fa-solid fa-cloud-arrow-up"></i> Đăng nhập để lưu
      </button>
    </div>
  );
}
