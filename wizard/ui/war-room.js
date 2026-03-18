(function () {
  'use strict';

  const REFRESH_INTERVAL_MS = 10000; // 10 second poll

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
    const pct = usage ? Math.round(usage.percent) : 0;
    // Circle circumference = 2 * PI * r = 2 * 3.14159 * 14 ≈ 88
    const offset = 88 - (88 * pct / 100);
    fill.style.strokeDashoffset = offset;
    // Color: green <50, yellow 50-70, red >70
    if (pct < 50) fill.setAttribute('stroke', '#34d399');
    else if (pct < 70) fill.setAttribute('stroke', '#fbbf24');
    else fill.setAttribute('stroke', '#ef4444');
    text.textContent = pct + '%';
    if (gauge) gauge.setAttribute('aria-valuenow', pct);
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
    const container = document.getElementById('agent-ticker');
    if (tickerMessages.length === 0) {
      container.innerHTML = '<span class="ticker-item"><span class="ticker-agent">Sisko</span> standing by...</span>';
      return;
    }
    container.innerHTML = tickerMessages.map(m =>
      `<span class="ticker-item"><span class="ticker-agent">${escapeHtml(m.agent)}</span> ${escapeHtml(m.action)}</span>`
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

  // ── Main poll loop ───────────────────────────────

  async function refresh() {
    const [campaign, build, findings, version, deploy, context] = await Promise.all([
      fetchJSON('/api/war-room/campaign'),
      fetchJSON('/api/war-room/build'),
      fetchJSON('/api/war-room/findings'),
      fetchJSON('/api/war-room/version'),
      fetchJSON('/api/war-room/deploy'),
      fetchJSON('/api/war-room/context'),
    ]);

    renderTimeline(campaign);
    renderPipeline(build);
    renderScoreboard(findings);
    renderVersion(version);
    renderDeploy(deploy);
    renderGauge(context);
    renderPrdCoverage(campaign);
  }

  // ── WebSocket for real-time updates ──────────────

  var wsRetryDelay = 1000;
  var WS_MAX_RETRY_DELAY = 30000;

  function connectWebSocket() {
    var wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(wsProtocol + '//' + location.host + '/ws/war-room');

    ws.onopen = function () {
      wsRetryDelay = 1000; // Reset backoff on successful connection
    };

    ws.onmessage = function (event) {
      try {
        var msg = JSON.parse(event.data);
        if (msg.type === 'agent-activity') {
          addTickerMessage(msg.agent, msg.action);
        } else if (msg.type === 'finding') {
          var el = document.getElementById('score-' + msg.severity);
          if (el) el.textContent = parseInt(el.textContent) + 1;
        } else if (msg.type === 'phase-update') {
          refresh();
        }
      } catch { /* ignore malformed messages */ }
    };

    ws.onerror = function () {
      // Error fires before close — logged for debugging, close handles reconnect
    };

    ws.onclose = function () {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
      setTimeout(connectWebSocket, wsRetryDelay);
      wsRetryDelay = Math.min(wsRetryDelay * 2, WS_MAX_RETRY_DELAY);
    };
  }

  // ── Init ─────────────────────────────────────────

  async function init() {
    await refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);
    connectWebSocket();
  }

  init();
})();
