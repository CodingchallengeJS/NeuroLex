import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import AuthModal from './AuthModal';
import GlobalSearchBar from './GlobalSearchBar';
import SettingsModal from './SettingsModal';

export default function Navbar() {
  const { user, logout, authOpen, openAuth, closeAuth, mergeNotice, dismissMergeNotice } = useContext(AuthContext);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!mergeNotice) return undefined;
    const timer = setTimeout(dismissMergeNotice, 6000);
    return () => clearTimeout(timer);
  }, [mergeNotice, dismissMergeNotice]);

  return (
    <>
      <nav className="floating-nav">
        <div className="nav-brand">
          <Link to="/">NeuroLex</Link>
        </div>
        <GlobalSearchBar />
        <div className="nav-links">
          <Link to="/">Trang chủ</Link>
          <Link to="/notebooks">Sổ tay</Link>
          <Link to="/questions">Câu hỏi</Link>
          <Link to="/about">Giới thiệu</Link>
        </div>
        <div className="nav-actions">
          {/* An icon, not a text link: .nav-links is hidden on phones, and this
              keeps the donate page reachable there. */}
          <Link to="/donate" className="icon-btn donate-btn" title="Ủng hộ NeuroLex" aria-label="Ủng hộ NeuroLex">
            <i className="fa-solid fa-heart"></i>
          </Link>
          <button className="icon-btn" onClick={() => setShowSettings(true)}>
            <i className="fa-solid fa-gear"></i>
          </button>
          {user ? (
            <div className="user-menu">
              <span className="username"><i className="fa-regular fa-user"></i> {user.username}</span>
              <button className="btn-outline btn-sm" onClick={logout}>Đăng xuất</button>
            </div>
          ) : (
            <button className="btn-primary btn-sm" onClick={openAuth}>Đăng nhập</button>
          )}
        </div>
      </nav>

      {authOpen && <AuthModal onClose={closeAuth} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {mergeNotice && (
        <div className={`merge-toast ${mergeNotice.ok ? '' : 'is-error'}`} role="status">
          <i className={`fa-solid ${mergeNotice.ok ? 'fa-cloud-arrow-up' : 'fa-triangle-exclamation'}`}></i>
          <span>
            {!mergeNotice.ok
              ? 'Chưa lưu được tiến độ trên trình duyệt này vào tài khoản. Sẽ thử lại lần sau, dữ liệu vẫn còn nguyên.'
              : mergeNotice.words > 0
                ? `Đã lưu ${mergeNotice.words} từ bạn học trên trình duyệt này vào tài khoản.`
                : 'Đã lưu tiến độ trên trình duyệt này vào tài khoản.'}
          </span>
          <button className="icon-btn" onClick={dismissMergeNotice} aria-label="Đóng">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}
    </>
  );
}
