(function () {
  const API_BASE_URL = 'https://neurolex-production.up.railway.app';
  const TOKEN_KEY = 'evl_access_token';

  const guestActions = document.getElementById('auth-guest-actions');
  const userActions = document.getElementById('auth-user-actions');
  const openLoginBtn = document.getElementById('open-login-btn');
  const openRegisterBtn = document.getElementById('open-register-btn');
  const profileBtn = document.getElementById('profile-btn');
  const logoutBtn = document.getElementById('logout-btn');

  const authModal = document.getElementById('auth-modal');
  const closeAuthModalBtn = document.getElementById('close-auth-modal');
  const authTitle = document.getElementById('auth-title');
  const authForm = document.getElementById('auth-form');
  const authUsernameLabel = document.getElementById('auth-username-label');
  const authUsernameInput = document.getElementById('auth-username');
  const authEmailInput = document.getElementById('auth-email');
  const authPasswordInput = document.getElementById('auth-password');
  const authSubmitBtn = document.getElementById('auth-submit');
  const switchAuthModeBtn = document.getElementById('switch-auth-mode');
  const authStatus = document.getElementById('auth-status');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeSettingsModalBtn = document.getElementById('close-settings-modal');
  const themeOptionButtons = Array.from(document.querySelectorAll('.theme-option'));

  const THEME_MODE_KEY = 'evl_theme_mode';
  const systemThemeMedia = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  let currentMode = 'login';
  let themeMode = 'system';

  function getSavedThemeMode() {
    const saved = localStorage.getItem(THEME_MODE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'system';
  }

  function getSystemTheme() {
    return systemThemeMedia && systemThemeMedia.matches ? 'dark' : 'light';
  }

  function setThemeOptionActive(mode) {
    themeOptionButtons.forEach((btn) => {
      const isActive = btn.dataset.themeMode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function applyThemeMode(mode) {
    const resolvedMode = mode === 'system' ? getSystemTheme() : mode;
    document.documentElement.setAttribute('data-theme', resolvedMode);
    themeMode = mode;
    setThemeOptionActive(mode);
  }

  function saveAndApplyThemeMode(mode) {
    localStorage.setItem(THEME_MODE_KEY, mode);
    applyThemeMode(mode);
  }

  function openSettingsModal() {
    if (!settingsModal) return;
    settingsModal.classList.remove('hidden');
    settingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeSettingsModal() {
    if (!settingsModal) return;
    settingsModal.classList.add('hidden');
    settingsModal.setAttribute('aria-hidden', 'true');
  }

  function setAuthStatus(message, type) {
    if (!authStatus) return;
    authStatus.textContent = message || '';
    authStatus.classList.remove('success');
    if (type === 'success') {
      authStatus.classList.add('success');
    }
  }

  function openAuthModal(mode) {
    if (!authModal) return;
    currentMode = mode;

    const isLogin = mode === 'login';
    authTitle.textContent = isLogin ? 'Đăng nhập' : 'Đăng ký';
    authSubmitBtn.textContent = isLogin ? 'Đăng nhập' : 'Tạo tài khoản';
    switchAuthModeBtn.textContent = isLogin
      ? 'Chưa có tài khoản? Đăng ký ngay'
      : 'Đã có tài khoản? Đăng nhập';
    authUsernameLabel.classList.toggle('hidden', isLogin);
    authUsernameInput.classList.toggle('hidden', isLogin);
    authUsernameInput.required = !isLogin;

    setAuthStatus('');
    authForm.reset();

    authModal.classList.remove('hidden');
    authModal.setAttribute('aria-hidden', 'false');
    authEmailInput.focus();
  }

  function closeAuthModal() {
    if (!authModal) return;
    authModal.classList.add('hidden');
    authModal.setAttribute('aria-hidden', 'true');
    setAuthStatus('');
  }

  function saveToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function setGuestState() {
    guestActions.classList.remove('hidden');
    userActions.classList.add('hidden');
    profileBtn.textContent = '';
  }

  function setUserState(user) {
    guestActions.classList.add('hidden');
    userActions.classList.remove('hidden');
    profileBtn.textContent = user.username || user.email;
    profileBtn.title = user.email;
  }

  async function apiRequest(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options && options.headers ? options.headers : {})
      },
      ...options
    });

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Yêu cầu thất bại');
    }

    return data;
  }

  async function fetchMeAndRender() {
    const token = getToken();
    if (!token) {
      setGuestState();
      return;
    }

    try {
      const data = await apiRequest('/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      setUserState(data.user);
    } catch (_error) {
      clearToken();
      setGuestState();
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const username = authUsernameInput.value.trim();
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value;

    if (!email || !password) {
      setAuthStatus('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }

    if (currentMode === 'register' && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setAuthStatus('Username 3-30 ký tự, chỉ gồm chữ, số và dấu gạch dưới.');
      return;
    }

    authSubmitBtn.disabled = true;

    try {
      if (currentMode === 'register') {
        await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ username: username, email: email, password: password })
        });
        setAuthStatus('Đăng ký thành công. Đang đăng nhập...', 'success');
      }

      const loginData = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: password })
      });

      saveToken(loginData.accessToken);
      setUserState(loginData.user);
      closeAuthModal();
    } catch (error) {
      setAuthStatus(error.message || 'Không thể xử lý yêu cầu.');
    } finally {
      authSubmitBtn.disabled = false;
    }
  }

  openLoginBtn.addEventListener('click', function () {
    openAuthModal('login');
  });

  openRegisterBtn.addEventListener('click', function () {
    openAuthModal('register');
  });

  closeAuthModalBtn.addEventListener('click', closeAuthModal);

  switchAuthModeBtn.addEventListener('click', function () {
    openAuthModal(currentMode === 'login' ? 'register' : 'login');
  });

  logoutBtn.addEventListener('click', function () {
    clearToken();
    setGuestState();
  });

  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
  }

  if (closeSettingsModalBtn) {
    closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
  }

  if (settingsModal) {
    settingsModal.addEventListener('click', function (event) {
      if (event.target === settingsModal) {
        closeSettingsModal();
      }
    });
  }

  themeOptionButtons.forEach((btn) => {
    btn.addEventListener('click', function () {
      const mode = btn.dataset.themeMode;
      if (mode === 'light' || mode === 'dark' || mode === 'system') {
        saveAndApplyThemeMode(mode);
      }
    });
  });

  if (systemThemeMedia) {
    const onSystemThemeChanged = function () {
      if (themeMode === 'system') {
        applyThemeMode('system');
      }
    };

    if (typeof systemThemeMedia.addEventListener === 'function') {
      systemThemeMedia.addEventListener('change', onSystemThemeChanged);
    } else if (typeof systemThemeMedia.addListener === 'function') {
      systemThemeMedia.addListener(onSystemThemeChanged);
    }
  }

  authModal.addEventListener('click', function (event) {
    if (event.target === authModal) {
      closeAuthModal();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeSettingsModal();
      closeAuthModal();
    }
  });

  authForm.addEventListener('submit', handleAuthSubmit);

  applyThemeMode(getSavedThemeMode());
  fetchMeAndRender();
})();
