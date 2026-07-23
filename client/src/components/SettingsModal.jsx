import { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

export default function SettingsModal({ onClose }) {
  const { theme, setTheme } = useContext(ThemeContext);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cài đặt</h3>
          <button className="close-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="modal-body">
          <div className="setting-group">
            <label>Giao diện</label>
            <div className="theme-toggle">
              <button 
                className={`btn-outline ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                <i className="fa-solid fa-sun"></i> Sáng
              </button>
              <button 
                className={`btn-outline ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                <i className="fa-solid fa-moon"></i> Tối
              </button>
              <button 
                className={`btn-outline ${theme === 'system' ? 'active' : ''}`}
                onClick={() => setTheme('system')}
              >
                <i className="fa-solid fa-desktop"></i> Hệ thống
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
