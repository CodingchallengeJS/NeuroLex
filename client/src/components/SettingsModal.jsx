import { useContext } from 'react';
import { ThemeContext } from '../context/ThemeContext';

const THEMES = [
  { value: 'light', icon: 'fa-sun', label: 'Sáng' },
  { value: 'dark', icon: 'fa-moon', label: 'Tối' },
  { value: 'system', icon: 'fa-desktop', label: 'Hệ thống' }
];

export default function SettingsModal({ onClose }) {
  const { theme, setTheme } = useContext(ThemeContext);

  // Unknown/unset theme falls back to the first segment so the thumb always
  // has somewhere to sit.
  const index = Math.max(0, THEMES.findIndex(t => t.value === theme));

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
              <div
                className="segmented segmented-full"
                role="group"
                aria-label="Giao diện"
                style={{ '--seg-count': THEMES.length, '--seg-index': index }}
              >
                <span className="segmented-thumb" aria-hidden="true" />
                {THEMES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    className={`segmented-btn ${theme === t.value ? 'active' : ''}`}
                    onClick={() => setTheme(t.value)}
                    aria-pressed={theme === t.value}
                  >
                    <i className={`fa-solid ${t.icon}`}></i> {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
