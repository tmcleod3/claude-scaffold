(function () {
  'use strict';

  const FAST_POLL_MS = 5000;   // 5s — live feed (context, cost)
  const SLOW_POLL_MS = 60000;  // 60s — system status (version, deploy, experiments)

  // ── Data fetchers ────────────────────────────────

  async function fetchJSON(url) {
    try {
      const res = await fetch(url, { headers: { 'X-VoidForge-Request': '1' } });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  // ── Campaign Timeline ────────────────────────────

  function renderTimeline(campaignData) {
    const container = document.getElementById('campaign-timeline');
    if (!campaignData || !campaignData.missions) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text-dim)">No campaign active</span>';
      return;
    }
    container.innerHTML = '';
    for (const mission of campaignData.missions) {
      const el = document.createElement('div');
      el.className = 'timeline-item';
      el.textContent = mission.number;
      el.title = mission.name + ' — ' + mission.status;
      switch (mission.status) {
        case 'COMPLETE': el.classList.add('timeline-complete'); break;
        case 'ACTIVE': el.classList.add('timeline-active'); break;
        case 'BLOCKED': el.classList.add('timeline-blocked'); break;
        default: el.classList.add('timeline-pending');
      }
      container.appendChild(el);
    }
  }

  // ── Phase Pipeline ───────────────────────────────

  function renderPipeline(phaseData) {
    const container = document.getElementById('phase-pipeline');
    if (!phaseData || !phaseData.phases) {
      container.innerHTML = '<div class="pipeline-phase"><span class="pipeline-dot pending"></span><span class="pipeline-label">No active build</span></div>';
      return;
    }
    container.innerHTML = '';
    for (const phase of phaseData.phases) {
      const el = document.createElement('div');
      el.className = 'pipeline-phase';
      const dot = document.createElement('span');
      dot.className = 'pipeline-dot ' + (phase.status || 'pending');
      const label = document.createElement('span');
      label.className = 'pipeline-label';
      label.textContent = phase.name;
      el.appendChild(dot);
      el.appendChild(label);
      container.appendChild(el);
    }
  }

  // ── Finding Scoreboard ───────────────────────────

  function renderScoreboard(findings) {
    document.getElementById('score-critical').textContent = (findings && findings.critical) || 0;
    document.getElementById('score-high').textContent = (findings && findings.high) || 0;
    document.getElementById('score-medium').textContent = (findings && findings.medium) || 0;
    document.getElementById('score-low').textContent = (findings && findings.low) || 0;
  }

  // ── Context Gauge ────────────────────────────────

  function renderGauge(usage) {
    const fill = document.getElementById('gauge-fill');
    const text = document.getElementById('gauge-text');
    const gauge = document.getElementById('context-gauge');
    const emptyHint = document.getElementById('context-empty');
    const modelDisplay = document.getElementById('context-model');
    const headerCtx = document.getElementById('header-context');
    if (!usage) {
      text.textContent = '\u2014%';
      fill.style.strokeDashoffset = 88;
      if (headerCtx) headerCtx.textContent = '\u2014%';
      if (gauge) gauge.removeAttribute('aria-valuenow');
      if (emptyHint) emptyHint.style.display = '';
      if (modelDisplay) modelDisplay.textContent = '';
      return;
    }
    if (emptyHint) emptyHint.style.display = 'none';
    const pct = Math.round(usage.percent);
    const offset = 88 - (88 * pct / 100);
    fill.style.strokeDashoffset = offset;
    if (pct < 50) fill.setAttribute('stroke', '#34d399');
    else if (pct < 70) fill.setAttribute('stroke', '#fbbf24');
    else fill.setAttribute('stroke', '#ef4444');
    text.textContent = pct + '%';
    if (gauge) gauge.setAttribute('aria-valuenow', pct);
    // Compact header indicator (always visible — Gauntlet UX-005)
    if (headerCtx) {
      headerCtx.textContent = pct + '%';
      headerCtx.style.color = pct < 50 ? '#34d399' : pct < 70 ? '#fbbf24' : '#ef4444';
      headerCtx.style.borderColor = headerCtx.style.color;
    }
    if (modelDisplay && usage.model) modelDisplay.textContent = usage.model;
    // Update cost display from same data source
    var costEl = document.getElementById('cost-display');
    var costEmpty = document.getElementById('cost-empty');
    if (costEl && usage.cost != null) {
      costEl.textContent = '$' + usage.cost.toFixed(4);
      if (costEmpty) costEmpty.style.display = 'none';
    }
  }

  // ── Version & Branch ─────────────────────────────

  function renderVersion(versionData) {
    document.getElementById('version-badge').textContent = versionData ? ('v' + versionData.version) : '—';
    document.getElementById('version-display').textContent = versionData ? ('VoidForge v' + versionData.version) : 'VoidForge';
    document.getElementById('branch-status').textContent = versionData ? versionData.branch : '—';
  }

  // ── Deploy Status ────────────────────────────────

  function renderDeploy(deployData) {
    const container = document.getElementById('deploy-status');
    if (!deployData || !deployData.url) {
      container.innerHTML = '<span class="deploy-dot unknown"></span><span>No deploy data</span>';
      return;
    }
    const dotClass = deployData.healthy ? 'live' : 'down';
    container.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'deploy-dot ' + dotClass;
    const label = document.createElement('span');
    label.textContent = deployData.url;
    container.appendChild(dot);
    container.appendChild(label);
  }

  // ── Agent Activity Ticker ────────────────────────

  const tickerMessages = [];
  const MAX_TICKER = 10;

  function addTickerMessage(agent, action) {
    tickerMessages.unshift({ agent, action, time: Date.now() });
    if (tickerMessages.length > MAX_TICKER) tickerMessages.pop();
    renderTicker();
  }

  function renderTicker() {
    // Update both: footer ticker (scrolling) and Tier 1 panel (detailed)
    const footer = document.getElementById('agent-ticker');
    const panel = document.getElementById('agent-ticker-panel');
    if (tickerMessages.length === 0) {
      if (footer) footer.innerHTML = '<span class="ticker-item"><span class="ticker-agent">Sisko</span> standing by...</span>';
      return;
    }
    var html = tickerMessages.map(m =>
      `<span class="ticker-item"><span class="ticker-agent">${escapeHtml(m.agent)}</span> ${escapeHtml(m.action)}</span>`
    ).join('');
    if (footer) footer.innerHTML = html;
    if (panel) panel.innerHTML = tickerMessages.map(m =>
      `<div style="margin-bottom:4px;"><span class="ticker-agent">${escapeHtml(m.agent)}</span> <span style="color:var(--text-dim)">${escapeHtml(m.action)}</span></div>`
    ).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── PRD Coverage ─────────────────────────────────

  function renderPrdCoverage(coverage) {
    const container = document.getElementById('prd-coverage');
    if (!coverage || !coverage.sections) {
      container.textContent = 'No campaign active';
      return;
    }
    const complete = coverage.sections.filter(s => s.status === 'COMPLETE').length;
    const total = coverage.sections.length;
    const pct = total > 0 ? Math.round(complete / total * 100) : 0;
    container.innerHTML = `<div style="margin-bottom:6px">${complete}/${total} sections (${pct}%)</div>` +
      `<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">` +
      `<div style="height:100%;width:${pct}%;background:#34d399;border-radius:3px;transition:width 0.5s"></div></div>`;
  }

  // ── Test Suite ───────────────────────────────────

  function renderTests(testData) {
    const container = document.getElementById('test-status');
    if (!testData) { container.textContent = 'No test data'; return; }
    container.innerHTML =
      `<span style="color:#34d399">${testData.pass || 0} pass</span> · ` +
      `<span style="color:#ef4444">${testData.fail || 0} fail</span> · ` +
      `<span style="color:var(--text-dim)">${testData.skip || 0} skip</span>`;
  }

  // ── Experiment Dashboard ──────────────────────────

  function renderExperiments(data) {
    const container = document.getElementById('experiment-dashboard');
    if (!data || !data.experiments || data.experiments.length === 0) {
      container.textContent = 'No experiments';
      return;
    }
    var complete = data.experiments.filter(function(e) { return e.status === 'complete'; }).length;
    var running = data.experiments.filter(function(e) { return e.status === 'running'; }).length;
    var planned = data.experiments.filter(function(e) { return e.status === 'planned'; }).length;
    container.innerHTML =
      '<span style="color:#34d399">' + complete + ' complete</span> · ' +
      '<span style="color:#fbbf24">' + running + ' running</span> · ' +
      '<span style="color:var(--text-dim)">' + planned + ' planned</span>';
  }

  // ── Tiered poll loops (v13.0 — fast for live data, slow for system status) ──

  /** Fast poll (5s): live feed data that changes per-message */
  async function refreshFast() {
    const [context] = await Promise.all([
      fetchJSON('/api/danger-room/context'),
    ]);
    renderGauge(context);
  }

  /** Campaign poll (10s): campaign state that changes per-mission */
  async function refreshCampaign() {
    const [campaign, build, findings] = await Promise.all([
      fetchJSON('/api/danger-room/campaign'),
      fetchJSON('/api/danger-room/build'),
      fetchJSON('/api/danger-room/findings'),
    ]);
    renderTimeline(campaign);
    renderPipeline(build);
    renderScoreboard(findings);
    renderPrdCoverage(campaign);
    if (typeof window.renderProphecyGraph === 'function') {
      window.renderProphecyGraph(document.getElementById('prophecy-graph'), campaign);
    }
  }

  /** Slow poll (60s): system status that changes rarely */
  async function refreshSlow() {
    const [version, deploy, experiments] = await Promise.all([
      fetchJSON('/api/danger-room/version'),
      fetchJSON('/api/danger-room/deploy'),
      fetchJSON('/api/danger-room/experiments'),
    ]);
    renderVersion(version);
    renderDeploy(deploy);
    renderExperiments(experiments);
  }

  /** Full refresh — all tiers at once (used on init and reconnect) */
  async function refresh() {
    await Promise.all([refreshFast(), refreshCampaign(), refreshSlow()]);
  }

  // ── Tab Navigation (§9.20.2) ─────────────────────

  var cultivationInstalled = false;

  function switchTab(tabId) {
    // VG-008: fall back to 'ops' for unknown tab IDs
    if (!document.getElementById('tab-' + tabId)) tabId = 'ops';
    var tabs = document.querySelectorAll('[role="tab"]');
    var panels = document.querySelectorAll('.tab-panel');
    tabs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    panels.forEach(function (p) { p.classList.remove('active'); });
    var tab = document.getElementById('tab-' + tabId);
    var panel = document.getElementById('panel-' + tabId);
    if (tab) tab.setAttribute('aria-selected', 'true');
    if (panel) panel.classList.add('active');
    location.hash = tabId === 'ops' ? '' : tabId;
  }

  // Arrow key navigation within tab bar
  document.addEventListener('keydown', function (e) {
    var tabBar = document.getElementById('tab-bar');
    if (!tabBar || !tabBar.contains(document.activeElement)) return;
    var tabs = Array.from(tabBar.querySelectorAll('[role="tab"]'));
    var idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    if (e.key === 'ArrowRight') { tabs[(idx + 1) % tabs.length].focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { tabs[(idx - 1 + tabs.length) % tabs.length].focus(); e.preventDefault(); }
  });

  function initTabs() {
    // VG-009: Wire up tab clicks via addEventListener (CSP-compliant, no inline onclick)
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    // Wire up freeze buttons
    var freezeBtn = document.getElementById('freeze-btn');
    var freezeFab = document.getElementById('freeze-fab');
    if (freezeBtn) freezeBtn.addEventListener('click', handleFreeze);
    if (freezeFab) freezeFab.addEventListener('click', handleFreeze);

    // Check if Cultivation is installed by looking for heartbeat data
    fetchJSON('/api/danger-room/heartbeat').then(function (data) {
      if (data && data.cultivationInstalled) {
        cultivationInstalled = true;
        document.getElementById('tab-bar').classList.add('active');
        freezeBtn.classList.add('visible');
        freezeFab.classList.add('visible');
        // VG-011: Default to #growth when Cultivation is installed (PRD 9.20.2)
        var hash = location.hash.replace('#', '');
        switchTab(hash || 'growth');
      }
      // Without Cultivation: no tab bar, no freeze button, flat layout preserved
    });
  }

  // ── Freeze Button (§9.20.8) ─────────────────────

  function handleFreeze() {
    var btn = document.getElementById('freeze-btn');
    var fab = document.getElementById('freeze-fab');
    var isFrozen = btn.classList.contains('frozen');
    if (isFrozen) {
      // Unfreeze requires vault password + TOTP — show dialog
      alert('Unfreeze requires vault password + 2FA. Use /treasury --unfreeze in the CLI.');
      return;
    }
    if (!confirm('Freeze all spending across all platforms? Active campaigns will be paused.')) return;
    fetch('/api/danger-room/freeze', { method: 'POST', headers: { 'X-VoidForge-Request': '1' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok) {
          btn.classList.add('frozen');
          btn.innerHTML = '❄ FROZEN';
          btn.setAttribute('aria-pressed', 'true');
          fab.classList.add('frozen');
          fab.innerHTML = '❄';
          addTickerMessage('Dockson', 'ALL SPENDING FROZEN');
        }
      })
      .catch(function () { alert('Freeze failed — try /treasury --freeze in the CLI.'); });
  }
  // handleFreeze wired via addEventListener in initTabs()

  // ── WebSocket with Reconnection Banner (§9.19.9) ──

  var wsRetryDelay = 1000;
  var WS_MAX_RETRY_DELAY = 30000;
  var wsReconnectTimer = null;
  var wsConnected = false;

  function showReconnectBanner(state) {
    var banner = document.getElementById('reconnect-banner');
    banner.className = 'reconnect-banner';
    if (state === 'reconnecting') {
      banner.classList.add('reconnecting');
      banner.textContent = 'Reconnecting to VoidForge server...';
    } else if (state === 'failed') {
      banner.classList.add('failed');
      banner.innerHTML = 'Connection lost. <a href="javascript:location.reload()" style="color:white;text-decoration:underline;">Refresh page</a> or check if the VoidForge server is running.';
    } else {
      banner.className = 'reconnect-banner'; // hidden
    }
  }

  function connectWebSocket() {
    var wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(wsProtocol + '//' + location.host + '/ws/danger-room');

    ws.onopen = function () {
      wsRetryDelay = 1000;
      wsConnected = true;
      showReconnectBanner('hidden');
      // On reconnect: pull full state (§9.19.9)
      refresh();
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'agent-activity') {
          addTickerMessage(msg.agent, msg.action);
        } else if (msg.type === 'finding') {
          var el = document.getElementById('score-' + msg.severity);
          if (el) el.textContent = parseInt(el.textContent) + 1;
        } else if (msg.type === 'phase-update' || msg.type === 'growth-update') {
          refresh();
        }
      } catch { /* ignore malformed messages */ }
    };

    ws.onerror = function () {};

    ws.onclose = function () {
      wsConnected = false;
      if (wsRetryDelay <= WS_MAX_RETRY_DELAY) {
        showReconnectBanner('reconnecting');
      }
      wsReconnectTimer = setTimeout(function () {
        // After 2 minutes of failure, show permanent failure banner
        if (wsRetryDelay >= WS_MAX_RETRY_DELAY * 4) {
          showReconnectBanner('failed');
          return;
        }
        connectWebSocket();
      }, wsRetryDelay);
      wsRetryDelay = Math.min(wsRetryDelay * 2, WS_MAX_RETRY_DELAY);
    };
  }

  // ── Init ─────────────────────────────────────────

  async function init() {
    await refresh();
    setInterval(refreshFast, FAST_POLL_MS);
    setInterval(refreshCampaign, 10000); // 10s for campaign data
    setInterval(refreshSlow, SLOW_POLL_MS);
    connectWebSocket();
    initTabs();
  }

  init();
})();
