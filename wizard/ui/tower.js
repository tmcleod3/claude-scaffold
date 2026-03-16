/**
 * Avengers Tower — Browser terminal for VoidForge.
 * xterm.js + WebSocket → server-side PTY (node-pty).
 * Haku moves between worlds seamlessly.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────
  const tabs = []; // { id, sessionId, label, terminal, ws, fitAddon, panelEl }
  let activeTabId = null;

  // Read project info from URL params
  const params = new URLSearchParams(window.location.search);
  const projectDir = params.get('dir') || '';
  const projectName = params.get('name') || 'Project';
  const autoCommand = params.get('auto') || ''; // 'campaign', 'build', or '' — auto-type after Claude launches

  document.getElementById('project-name').textContent = '— ' + projectName;

  // ── DOM refs ───────────────────────────────────────
  const tabBar = document.getElementById('tab-bar');
  const container = document.getElementById('terminal-container');
  const loadingState = document.getElementById('loading-state');

  tabBar.setAttribute('role', 'tablist');

  const statusEl = document.getElementById('tower-status');

  function showStatus(msg, durationMs) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
    if (durationMs) {
      setTimeout(() => { statusEl.style.display = 'none'; }, durationMs);
    }
  }

  // ── API helpers ────────────────────────────────────
  async function createPtySession(label, initialCommand, cols, rows) {
    const res = await fetch('/api/terminal/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
      body: JSON.stringify({ projectDir, projectName, label, initialCommand, cols, rows }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create session');
    }
    const data = await res.json();
    return { session: data.session, authToken: data.authToken };
  }

  async function killPtySession(sessionId) {
    await fetch('/api/terminal/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
      body: JSON.stringify({ sessionId }),
    });
  }

  // ── Tab management ─────────────────────────────────
  let tabIdCounter = 0;

  function createTab(label, sessionId, authToken) {
    const tabId = ++tabIdCounter;

    // Create terminal
    const terminal = new Terminal({
      theme: {
        background: '#0d0d1a',
        foreground: '#e0e0e0',
        cursor: '#5b5bf7',
        cursorAccent: '#0d0d1a',
        selectionBackground: 'rgba(91, 91, 247, 0.3)',
        black: '#1a1a2e',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#5b5bf7',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e0e0e0',
        brightBlack: '#4a4a5e',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#818cf8',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      fontFamily: "'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    terminal.loadAddon(fitAddon);

    // Create panel
    const panelEl = document.createElement('div');
    panelEl.className = 'terminal-panel';
    panelEl.id = 'panel-' + tabId;
    panelEl.setAttribute('role', 'tabpanel');
    container.appendChild(panelEl);

    terminal.open(panelEl);
    fitAddon.fit();

    // Connect WebSocket
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/terminal?session=${sessionId}&token=${encodeURIComponent(authToken)}`);

    ws.onopen = () => {
      // Send initial resize
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    ws.onmessage = (event) => {
      terminal.write(event.data);
    };

    ws.onclose = () => {
      terminal.write('\r\n\x1b[90m[Session ended — close this tab or open a new one above]\x1b[0m\r\n');
    };

    // Forward keystrokes to WebSocket
    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    });
    resizeObserver.observe(panelEl);

    // Create tab element
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = tabId;
    tabEl.setAttribute('role', 'tab');
    tabEl.setAttribute('aria-selected', 'false');
    tabEl.setAttribute('tabindex', '0');
    tabEl.innerHTML = `<span class="tab-label">${escapeHtml(label)}</span><button class="close-tab" role="button" aria-label="Close ${escapeHtml(label)} tab" title="Close">&times;</button>`;

    tabEl.querySelector('.tab-label').addEventListener('click', () => {
      switchTab(tabId);
    });

    tabEl.querySelector('.close-tab').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tabId);
    });

    tabBar.appendChild(tabEl);

    const tab = { id: tabId, sessionId, label, terminal, ws, fitAddon, panelEl, tabEl, resizeObserver };
    tabs.push(tab);

    switchTab(tabId);
    return tab;
  }

  function switchTab(tabId) {
    activeTabId = tabId;
    for (const tab of tabs) {
      const isActive = tab.id === tabId;
      tab.panelEl.classList.toggle('active', isActive);
      tab.tabEl.classList.toggle('active', isActive);
      tab.tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (isActive) {
        tab.fitAddon.fit();
        tab.terminal.focus();
      }
    }
  }

  function closeTab(tabId) {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const tab = tabs[idx];
    tab.ws.close();
    tab.terminal.dispose();
    tab.resizeObserver.disconnect();
    tab.panelEl.remove();
    tab.tabEl.remove();
    killPtySession(tab.sessionId);
    tabs.splice(idx, 1);

    // Switch to another tab if this was active
    if (activeTabId === tabId && tabs.length > 0) {
      switchTab(tabs[Math.max(0, idx - 1)].id);
    }
  }

  // ── Button handlers ────────────────────────────────

  document.getElementById('btn-new-shell').addEventListener('click', async () => {
    try {
      const { session, authToken } = await createPtySession('Shell', undefined, 120, 30);
      createTab('Shell', session.id, authToken);
    } catch (err) {
      showStatus('Failed to create shell: ' + err.message, 5000);
    }
  });

  document.getElementById('btn-claude').addEventListener('click', async () => {
    try {
      const { session, authToken } = await createPtySession('Claude Code', 'claude --dangerously-skip-permissions', 120, 30);
      createTab('Claude Code', session.id, authToken);
    } catch (err) {
      showStatus('Failed to launch Claude Code: ' + err.message, 5000);
    }
  });

  // ── Utilities ──────────────────────────────────────

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Init ───────────────────────────────────────────

  async function init() {
    if (!projectDir) {
      loadingState.textContent = 'No project directory specified. Launch Avengers Tower from Gandalf.';
      return;
    }

    // Check vault status BEFORE creating session — WebSocket upgrade requires vault password
    try {
      const statusRes = await fetch('/api/credentials/status');
      const statusData = await statusRes.json();
      if (!statusData.unlocked) {
        showVaultUnlock();
        return;
      }
    } catch { /* if status check fails, try anyway and let the error handler catch it */ }

    try {
      loadingState.textContent = 'Launching Claude Code...';
      const { session, authToken } = await createPtySession('Claude Code', 'claude --dangerously-skip-permissions', 120, 30);
      loadingState.style.display = 'none';
      createTab('Claude Code', session.id, authToken);

      // Auto-command banner: show a prompt to run /campaign or /build
      if (autoCommand) {
        const banner = document.createElement('div');
        banner.className = 'auto-command-banner';
        banner.setAttribute('role', 'status');
        const cmdLabel = autoCommand === 'campaign' ? '/campaign' : '/' + autoCommand;
        banner.innerHTML = `
          <span>Ready to build <strong>${projectName}</strong>.</span>
          <button class="btn btn-primary" id="auto-cmd-run">Run ${cmdLabel}</button>
          <button class="btn btn-secondary" id="auto-cmd-dismiss">Dismiss</button>
        `;
        document.querySelector('.tower-header').after(banner);
        document.getElementById('auto-cmd-run').addEventListener('click', () => {
          // Find the active tab's WebSocket and send the command
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.ws && activeTab.ws.readyState === WebSocket.OPEN) {
            activeTab.ws.send(cmdLabel + '\n');
          }
          banner.remove();
        });
        document.getElementById('auto-cmd-dismiss').addEventListener('click', () => {
          banner.remove();
        });
      }
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('vault is locked') || msg.toLowerCase().includes('locked')) {
        showVaultUnlock();
      } else {
        loadingState.textContent = 'Failed to start: ' + msg;
        // Fallback — try a plain shell
        try {
          const { session, authToken } = await createPtySession('Shell', undefined, 120, 30);
          loadingState.style.display = 'none';
          createTab('Shell', session.id, authToken);
        } catch (err2) {
          const msg2 = err2.message || '';
          if (msg2.toLowerCase().includes('vault is locked') || msg2.toLowerCase().includes('locked')) {
            showVaultUnlock();
          } else {
            loadingState.textContent = 'Could not start terminal: ' + msg2;
          }
        }
      }
    }
  }

  function showVaultUnlock() {
    loadingState.style.display = 'none';
    // Remove any existing unlock form
    const existing = document.getElementById('vault-unlock-form');
    if (existing) existing.remove();

    const form = document.createElement('div');
    form.id = 'vault-unlock-form';
    form.className = 'vault-unlock-form';
    form.setAttribute('role', 'form');
    form.setAttribute('aria-label', 'Unlock vault');
    form.innerHTML = `
      <div class="vault-unlock-card">
        <h2>Vault Locked</h2>
        <p>Enter your vault password to start a terminal session.</p>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <input type="password" id="vault-pwd" placeholder="Vault password" autocomplete="off"
                 style="flex: 1; padding: 8px 12px; background: var(--bg, #0a0a0a); border: 1px solid var(--border, #333); border-radius: 4px; color: var(--text, #e5e5e5); font-size: 14px;">
          <button class="btn btn-primary" id="vault-unlock-btn" style="padding: 8px 16px;">Unlock</button>
        </div>
        <div id="vault-unlock-status" role="status" aria-live="polite" style="margin-top: 8px; font-size: 13px;"></div>
      </div>
    `;
    container.parentElement.insertBefore(form, container);

    const pwdInput = document.getElementById('vault-pwd');
    const unlockBtn = document.getElementById('vault-unlock-btn');
    const status = document.getElementById('vault-unlock-status');
    pwdInput.focus();

    async function doUnlock() {
      const password = pwdInput.value;
      if (!password) { status.textContent = 'Please enter your password.'; status.style.color = '#ef4444'; return; }

      unlockBtn.disabled = true;
      status.textContent = 'Unlocking...';
      status.style.color = '#888';

      try {
        const res = await fetch('/api/credentials/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (res.ok && data.unlocked) {
          form.remove();
          loadingState.style.display = '';
          // Retry terminal creation now that vault is unlocked
          init();
        } else {
          status.textContent = data.error || 'Wrong password.';
          status.style.color = '#ef4444';
          unlockBtn.disabled = false;
          pwdInput.select();
        }
      } catch (e) {
        status.textContent = 'Connection error.';
        status.style.color = '#ef4444';
        unlockBtn.disabled = false;
      }
    }

    unlockBtn.addEventListener('click', doUnlock);
    pwdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doUnlock(); });
  }

  // Back to Lobby — warn if terminals are open (sessions persist server-side)
  const backBtn = document.getElementById('btn-back-lobby');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      if (tabs.length > 0) {
        const leave = confirm('Terminal sessions will continue running in the background. Leave?');
        if (!leave) {
          e.preventDefault();
        }
      }
    });
  }

  async function start() {
    await init();

    window.addEventListener('beforeunload', (e) => {
      if (tabs.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  start();
})();
