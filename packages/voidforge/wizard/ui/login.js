/**
 * Login page — handles initial setup and authentication.
 * Two flows: setup (first visit) and login (subsequent visits).
 */

(function () {
  'use strict';

  // ── DOM refs ───────────────────────────────────────
  const setupSection = document.getElementById('setup-section');
  const loginSection = document.getElementById('login-section');
  const setupUsername = document.getElementById('setup-username');
  const setupPassword = document.getElementById('setup-password');
  const setupSubmit = document.getElementById('setup-submit');
  const setupStatus = document.getElementById('setup-status');
  const totpSetup = document.getElementById('totp-setup');
  const totpSecret = document.getElementById('totp-secret');
  const totpDone = document.getElementById('totp-done');
  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginTotp = document.getElementById('login-totp');
  const totpField = document.getElementById('totp-field');
  const loginSubmit = document.getElementById('login-submit');
  const loginStatus = document.getElementById('login-status');

  // ── API helpers ────────────────────────────────────

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session');
      const body = await res.json();
      return body.data || {};
    } catch {
      return {};
    }
  }

  async function setupAccount(username, password) {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Setup failed');
    return body.data;
  }

  async function loginUser(username, password, totpCode) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
      body: JSON.stringify({ username, password, totpCode }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Login failed');
    return body.data;
  }

  // ── Setup flow ─────────────────────────────────────

  function showSetup() {
    setupSection.classList.add('active');
    loginSection.classList.remove('active');
    setupUsername.focus();
  }

  function showLogin() {
    loginSection.classList.add('active');
    setupSection.classList.remove('active');
    loginUsername.focus();
  }

  setupSubmit.addEventListener('click', async () => {
    const username = setupUsername.value.trim();
    const password = setupPassword.value;

    if (username.length < 3) {
      setupStatus.textContent = 'Username must be at least 3 characters';
      setupStatus.className = 'status-row error';
      return;
    }
    if (password.length < 12) {
      setupStatus.textContent = 'Password must be at least 12 characters';
      setupStatus.className = 'status-row error';
      return;
    }

    setupSubmit.disabled = true;
    setupStatus.textContent = 'Creating account...';
    setupStatus.className = 'status-row loading';

    try {
      const data = await setupAccount(username, password);
      // Show TOTP setup
      setupStatus.textContent = '';
      setupStatus.className = 'status-row';
      totpSecret.textContent = data.totpSecret;
      totpSetup.style.display = 'block';
      setupSubmit.style.display = 'none';
    } catch (err) {
      setupStatus.textContent = err.message;
      setupStatus.className = 'status-row error';
      setupSubmit.disabled = false;
    }
  });

  totpDone.addEventListener('click', () => {
    showLogin();
  });

  // ── Login flow ─────────────────────────────────────

  // TOTP field is always visible (removed conditional show — accessibility fix)

  loginSubmit.addEventListener('click', async () => {
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    const totp = loginTotp.value.trim();

    if (!username || !password) {
      loginStatus.textContent = 'Username and password are required';
      loginStatus.className = 'status-row error';
      return;
    }
    if (!totp || totp.length !== 6) {
      loginStatus.textContent = 'Enter your 6-digit authenticator code';
      loginStatus.className = 'status-row error';
      loginTotp.focus();
      return;
    }

    loginSubmit.disabled = true;
    loginStatus.textContent = 'Signing in...';
    loginStatus.className = 'status-row loading';

    try {
      await loginUser(username, password, totp);
      // Success — redirect to The Lobby
      window.location.href = '/lobby.html';
    } catch (err) {
      loginStatus.textContent = err.message;
      loginStatus.className = 'status-row error';
      loginSubmit.disabled = false;

      // Clear TOTP field on failure (codes are single-use)
      loginTotp.value = '';
      loginTotp.focus();
    }
  });

  // Submit on Enter from any field
  [loginUsername, loginPassword, loginTotp].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loginSubmit.click();
    });
  });

  [setupUsername, setupPassword].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') setupSubmit.click();
    });
  });

  // ── Init ───────────────────────────────────────────

  async function init() {
    const session = await checkSession();

    if (session.authenticated) {
      // Already logged in — go to The Lobby
      window.location.href = '/lobby.html';
      return;
    }

    if (session.needsSetup) {
      showSetup();
    } else {
      showLogin();
    }
  }

  init();
})();
