import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import AuthModal from './AuthModal';
import SettingsModal from './SettingsModal';

export default function Navbar() {
  const { user, logout } = useContext(AuthContext);
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <nav className="floating-nav">
        <div className="nav-brand">
          <Link to="/">NeuroLex</Link>
        </div>
        <div className="nav-links">
          <Link to="/">Trang chủ</Link>
          <Link to="/notebooks">Sổ tay</Link>
        </div>
        <div className="nav-actions">
          <button className="icon-btn" onClick={() => setShowSettings(true)}>
            <i className="fa-solid fa-gear"></i>
          </button>
          {user ? (
            <div className="user-menu">
              <span className="username"><i className="fa-regular fa-user"></i> {user.username}</span>
              <button className="btn-outline btn-sm" onClick={logout}>Đăng xuất</button>
            </div>
          ) : (
            <button className="btn-primary btn-sm" onClick={() => setShowAuth(true)}>Đăng nhập</button>
          )}
        </div>
      </nav>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
