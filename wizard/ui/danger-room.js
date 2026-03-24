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
    if (pct < 50) fill.style.stroke = 'var(--success)';
    else if (pct < 70) fill.style.stroke = 'var(--warning)';
    else fill.style.stroke = 'var(--error)';
    text.textContent = pct + '%';
    if (gauge) gauge.setAttribute('aria-valuenow', pct);
    // Compact header indicator (always visible — Gauntlet UX-005)
    if (headerCtx) {
      headerCtx.textContent = pct + '%';
      headerCtx.style.color = pct < 50 ? 'var(--success)' : pct < 70 ? 'var(--warning)' : 'var(--error)';
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
      `<div style="height:100%;width:${pct}%;background:var(--success);border-radius:3px;transition:width 0.5s"></div></div>`;
  }

  // ── Test Suite ───────────────────────────────────

  function renderTests(testData) {
    const container = document.getElementById('test-status');
    if (!testData) { container.textContent = 'No test data'; return; }
    container.innerHTML =
      `<span style="color:var(--success)">${testData.pass || 0} pass</span> · ` +
      `<span style="color:var(--error)">${testData.fail || 0} fail</span> · ` +
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
      '<span style="color:var(--success)">' + complete + ' complete</span> · ' +
      '<span style="color:var(--warning)">' + running + ' running</span> · ' +
      '<span style="color:var(--text-dim)">' + planned + ' planned</span>';
  }

  // ── Growth Tab: KPI Rendering ──────────────────────

  function formatCents(cents) {
    if (cents == null) return '$0.00';
    return '$' + (Math.abs(cents) / 100).toFixed(2);
  }

  function formatRoas(roas) {
    if (roas == null || roas === 0) return '0.0x';
    return roas.toFixed(1) + 'x';
  }

  function renderGrowthTab(treasury) {
    var emptyState = document.getElementById('growth-empty-state');
    var kpiRow = document.getElementById('growth-kpi-row');
    var systemStatus = document.getElementById('growth-system-status');
    var roasPanel = document.getElementById('growth-roas-panel');
    var trafficPanel = document.getElementById('growth-traffic-panel');
    var funnelPanel = document.getElementById('growth-funnel-panel');

    if (!cultivationInstalled) {
      if (emptyState) emptyState.style.display = '';
      if (kpiRow) kpiRow.style.display = 'none';
      if (systemStatus) systemStatus.innerHTML = 'Cultivation: not installed \u2014 run <code>/cultivation install</code> to begin';
      return;
    }

    if (systemStatus) systemStatus.innerHTML = 'Cultivation: <span style="color:var(--fin-healthy);">active</span>';

    var hasData = treasury && (treasury.revenue > 0 || treasury.spend > 0);
    if (!hasData) {
      if (emptyState) { emptyState.style.display = ''; emptyState.innerHTML = '<div>Cultivation installed but no financial data yet.</div><div style="margin-top:8px;">Run <code>/grow</code> to start your first growth campaign.</div>'; }
      if (kpiRow) kpiRow.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (kpiRow) kpiRow.style.display = '';
    if (roasPanel) roasPanel.style.display = '';
    if (trafficPanel) trafficPanel.style.display = '';
    if (funnelPanel) funnelPanel.style.display = '';

    var revenueEl = document.getElementById('kpi-revenue');
    var spendEl = document.getElementById('kpi-spend');
    var netEl = document.getElementById('kpi-net');
    var roasEl = document.getElementById('kpi-roas');

    if (revenueEl) revenueEl.textContent = formatCents(treasury.revenue);
    if (spendEl) spendEl.textContent = formatCents(treasury.spend);
    if (netEl) {
      netEl.textContent = formatCents(treasury.net);
      netEl.style.color = treasury.net >= 0 ? 'var(--fin-positive)' : 'var(--fin-negative)';
    }
    if (roasEl) roasEl.textContent = formatRoas(treasury.roas);
  }

  // ── Campaigns Tab: Table Rendering ────────────────

  function renderCampaignsTab(campaigns) {
    var emptyState = document.getElementById('campaigns-empty-state');
    var tablePanel = document.getElementById('campaigns-table-panel');
    var abPanel = document.getElementById('campaigns-ab-panel');
    var recsPanel = document.getElementById('campaigns-recommendations-panel');

    if (!cultivationInstalled) {
      if (emptyState) { emptyState.style.display = ''; emptyState.innerHTML = '<div>No ad campaigns yet.</div><div style="margin-top:8px;">Run <code>/grow --setup</code> to configure ad platforms.</div>'; }
      if (tablePanel) tablePanel.style.display = 'none';
      return;
    }

    if (!campaigns || campaigns.length === 0) {
      if (emptyState) { emptyState.style.display = ''; emptyState.innerHTML = '<div>No campaigns yet.</div><div style="margin-top:8px;">Run <code>/grow --setup</code> to configure ad platforms.</div>'; }
      if (tablePanel) tablePanel.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (tablePanel) tablePanel.style.display = '';
    if (abPanel) abPanel.style.display = '';
    if (recsPanel) recsPanel.style.display = '';

    var tbody = document.getElementById('campaigns-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (var i = 0; i < campaigns.length; i++) {
      var c = campaigns[i];
      var tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border)';

      var statusColor = c.status === 'active' ? 'var(--fin-healthy)'
        : c.status === 'paused' ? 'var(--fin-warning)'
        : 'var(--fin-inactive)';

      tr.innerHTML =
        '<td style="padding:6px 8px;">' + escapeHtml(c.platform || '\u2014') + '</td>' +
        '<td style="padding:6px 8px;">' + escapeHtml(c.name || c.id || '\u2014') + '</td>' +
        '<td style="padding:6px 8px;">' + formatCents(c.spendCents || c.spend || 0) + '</td>' +
        '<td style="padding:6px 8px;">' + (c.conversions != null ? c.conversions : '\u2014') + '</td>' +
        '<td style="padding:6px 8px;">' + formatRoas(c.roas) + '</td>' +
        '<td style="padding:6px 8px;color:' + statusColor + ';">' + escapeHtml(c.status || 'unknown') + '</td>';
      tbody.appendChild(tr);
    }
  }

  // ── Treasury Tab: Financial Summary ───────────────

  function renderTreasuryTab(treasury, heartbeat) {
    var emptyState = document.getElementById('treasury-empty-state');
    var kpiRow = document.getElementById('treasury-kpi-row');
    var budgetPanel = document.getElementById('treasury-budget-panel');
    var connectionsPanel = document.getElementById('treasury-connections-panel');
    var reconciliationPanel = document.getElementById('treasury-reconciliation-panel');

    if (!cultivationInstalled) {
      if (emptyState) emptyState.style.display = '';
      if (kpiRow) kpiRow.style.display = 'none';
      if (budgetPanel) budgetPanel.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (kpiRow) kpiRow.style.display = '';
    if (budgetPanel) budgetPanel.style.display = '';
    if (connectionsPanel) connectionsPanel.style.display = '';
    if (reconciliationPanel) reconciliationPanel.style.display = '';

    // KPI row
    var revEl = document.getElementById('treasury-revenue');
    var spendEl = document.getElementById('treasury-spend');
    var netEl = document.getElementById('treasury-net');
    var roasEl = document.getElementById('treasury-roas');

    if (revEl) revEl.textContent = formatCents(treasury.revenue);
    if (spendEl) spendEl.textContent = formatCents(treasury.spend);
    if (netEl) {
      netEl.textContent = formatCents(treasury.net);
      netEl.style.color = treasury.net >= 0 ? 'var(--fin-positive)' : 'var(--fin-negative)';
    }
    if (roasEl) roasEl.textContent = formatRoas(treasury.roas);

    // Budget bar
    var budgetBar = document.getElementById('treasury-budget-bar');
    var budgetUsed = document.getElementById('treasury-budget-used');
    var budgetTotal = document.getElementById('treasury-budget-total');
    var totalBudget = treasury.spend + (treasury.budgetRemaining || 0);
    var pct = totalBudget > 0 ? Math.min(100, Math.round(treasury.spend / totalBudget * 100)) : 0;

    if (budgetBar) {
      budgetBar.style.width = pct + '%';
      budgetBar.setAttribute('aria-valuenow', pct);
      budgetBar.setAttribute('aria-valuetext', pct + '% of budget used');
      budgetBar.style.background = pct > 90 ? 'var(--fin-negative)' : pct > 75 ? 'var(--fin-warning)' : 'var(--fin-positive)';
    }
    if (budgetUsed) budgetUsed.textContent = formatCents(treasury.spend) + ' used';
    if (budgetTotal) budgetTotal.textContent = totalBudget > 0 ? formatCents(totalBudget) + ' total' : 'No budget set';

    // Connections — show active platforms from heartbeat
    var connectionsEl = document.getElementById('treasury-connections');
    if (connectionsEl && heartbeat) {
      var platforms = heartbeat.activePlatforms || [];
      if (platforms.length === 0) {
        connectionsEl.innerHTML = '<span style="color:var(--text-dim);">No platforms connected</span>';
      } else {
        connectionsEl.innerHTML = platforms.map(function (p) {
          return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
            '<span class="deploy-dot live"></span>' +
            '<span>' + escapeHtml(p) + '</span></div>';
        }).join('');
      }
    }

    // Vault/daemon state
    var reconEl = document.getElementById('treasury-reconciliation');
    if (reconEl && heartbeat) {
      var vaultState = heartbeat.state === 'degraded' ? 'locked' : 'unlocked';
      var vaultColor = vaultState === 'unlocked' ? 'var(--fin-healthy)' : 'var(--fin-warning)';
      reconEl.innerHTML =
        '<div style="margin-bottom:4px;"><span style="color:var(--text-dim);">Vault:</span> <span style="color:' + vaultColor + ';">' + vaultState + '</span></div>' +
        '<div><span style="color:var(--text-dim);">Daemon:</span> <span style="color:var(--fin-healthy);">' + escapeHtml(heartbeat.state || 'unknown') + '</span></div>';
    } else if (reconEl) {
      reconEl.innerHTML = '<span style="color:var(--text-dim);">Daemon not running</span>';
    }
  }

  // ── Heartbeat Tab: Daemon Status ──────────────────

  function formatUptime(startedAt) {
    if (!startedAt) return '\u2014';
    var diff = Date.now() - new Date(startedAt).getTime();
    if (diff < 0) return '\u2014';
    var hours = Math.floor(diff / 3600000);
    var minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    return minutes + 'm';
  }

  function formatRelativeTime(ts) {
    if (!ts) return '\u2014';
    var diff = Date.now() - new Date(ts).getTime();
    if (diff < 0) return 'just now';
    if (diff < 60000) return Math.floor(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    return Math.floor(diff / 3600000) + 'h ago';
  }

  function renderHeartbeatTab(heartbeat) {
    var emptyState = document.getElementById('heartbeat-empty-state');
    var statusPanel = document.getElementById('heartbeat-status-panel');
    var tokensPanel = document.getElementById('heartbeat-tokens-panel');
    var jobsPanel = document.getElementById('heartbeat-jobs-panel');
    var alertsPanel = document.getElementById('heartbeat-alerts-panel');

    if (!cultivationInstalled || !heartbeat) {
      if (emptyState) emptyState.style.display = '';
      if (statusPanel) statusPanel.style.display = 'none';
      if (tokensPanel) tokensPanel.style.display = 'none';
      if (jobsPanel) jobsPanel.style.display = 'none';
      if (alertsPanel) alertsPanel.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (statusPanel) statusPanel.style.display = '';

    // State
    var stateEl = document.getElementById('hb-state');
    if (stateEl) {
      stateEl.textContent = heartbeat.state || 'unknown';
      stateEl.style.color = heartbeat.state === 'healthy' ? 'var(--fin-healthy)'
        : heartbeat.state === 'degraded' ? 'var(--fin-warning)'
        : 'var(--fin-error)';
    }

    // PID
    var pidEl = document.getElementById('hb-pid');
    if (pidEl) pidEl.textContent = heartbeat.pid || '\u2014';

    // Uptime
    var uptimeEl = document.getElementById('hb-uptime');
    if (uptimeEl) uptimeEl.textContent = formatUptime(heartbeat.startedAt);

    // Last heartbeat
    var lastBeatEl = document.getElementById('hb-last-beat');
    if (lastBeatEl) lastBeatEl.textContent = formatRelativeTime(heartbeat.lastHeartbeat);

    // Token health
    var tokenHealth = heartbeat.tokenHealth || {};
    var tokenList = document.getElementById('hb-token-list');
    var platformKeys = Object.keys(tokenHealth);
    if (tokensPanel && platformKeys.length > 0) {
      tokensPanel.style.display = '';
      if (tokenList) {
        tokenList.innerHTML = platformKeys.map(function (p) {
          var info = tokenHealth[p];
          var statusColor = info.status === 'healthy' ? 'var(--fin-healthy)'
            : info.status === 'requires_reauth' ? 'var(--fin-error)'
            : 'var(--fin-warning)';
          var expiry = info.expiresAt ? ' \u00b7 expires ' + formatRelativeTime(info.expiresAt) : '';
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            '<span class="deploy-dot" style="background:' + statusColor + ';"></span>' +
            '<span>' + escapeHtml(p) + '</span>' +
            '<span style="color:' + statusColor + ';font-size:11px;">' + escapeHtml(info.status || 'unknown') + expiry + '</span></div>';
        }).join('');
      }
    } else if (tokensPanel) {
      tokensPanel.style.display = '';
      if (tokenList) tokenList.innerHTML = '<span style="color:var(--text-dim);">No platform tokens configured</span>';
    }

    // Scheduled jobs (show next expected jobs based on daemon state)
    if (jobsPanel) {
      jobsPanel.style.display = '';
      var jobsList = document.getElementById('hb-jobs-list');
      if (jobsList) {
        var activePlatforms = heartbeat.activePlatforms || [];
        var activeCampaigns = heartbeat.activeCampaigns || 0;
        jobsList.innerHTML =
          '<div style="margin-bottom:4px;"><span style="color:var(--text-dim);">Active platforms:</span> ' + (activePlatforms.length > 0 ? escapeHtml(activePlatforms.join(', ')) : 'none') + '</div>' +
          '<div style="margin-bottom:4px;"><span style="color:var(--text-dim);">Active campaigns:</span> ' + activeCampaigns + '</div>' +
          '<div style="margin-bottom:4px;"><span style="color:var(--text-dim);">Today spend:</span> ' + formatCents(heartbeat.todaySpend) + '</div>' +
          '<div><span style="color:var(--text-dim);">Daily budget:</span> ' + (heartbeat.dailyBudget > 0 ? formatCents(heartbeat.dailyBudget) : 'not set') + '</div>';
      }
    }

    // Alerts
    var alerts = heartbeat.alerts || [];
    if (alertsPanel) {
      alertsPanel.style.display = '';
      var alertsEl = document.getElementById('hb-alerts');
      if (alertsEl) {
        if (alerts.length === 0) {
          alertsEl.innerHTML = '<span style="color:var(--fin-healthy);">No alerts \u2014 all systems nominal</span>';
        } else {
          alertsEl.innerHTML = alerts.map(function (a) {
            var alertColor = a.severity === 'critical' ? 'var(--fin-error)' : a.severity === 'warning' ? 'var(--fin-warning)' : 'var(--text-dim)';
            return '<div style="margin-bottom:6px;padding:6px 8px;border-left:3px solid ' + alertColor + ';background:var(--bg);border-radius:2px;">' +
              '<span style="font-weight:600;color:' + alertColor + ';">' + escapeHtml(a.type || 'alert') + '</span> ' +
              '<span>' + escapeHtml(a.message || '') + '</span></div>';
          }).join('');
        }
      }
    }
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

  /** Growth poll (30s): heartbeat, treasury, and campaign data for growth tabs */
  async function refreshGrowth() {
    var data = await fetchJSON('/api/danger-room/heartbeat');
    if (!data) return;
    cultivationInstalled = !!data.cultivationInstalled;
    renderGrowthTab(data.treasury);
    renderCampaignsTab(data.campaigns);
    renderTreasuryTab(data.treasury, data.heartbeat);
    renderHeartbeatTab(data.heartbeat);
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
    await Promise.all([refreshFast(), refreshCampaign(), refreshGrowth(), refreshSlow()]);
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

    // cultivationInstalled is set by refreshGrowth() during the initial refresh() call.
    // Use that state to show/hide growth UI elements.
    if (cultivationInstalled) {
      document.getElementById('tab-bar').classList.add('active');
      if (freezeBtn) freezeBtn.classList.add('visible');
      if (freezeFab) freezeFab.classList.add('visible');
      // VG-011: Default to #growth when Cultivation is installed (PRD 9.20.2)
      var hash = location.hash.replace('#', '');
      switchTab(hash || 'growth');
    }
    // Without Cultivation: no tab bar, no freeze button, flat layout preserved
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
    setInterval(refreshGrowth, 30000);   // 30s for growth/treasury/heartbeat tabs
    setInterval(refreshSlow, SLOW_POLL_MS);
    connectWebSocket();
    initTabs();
  }

  init();
})();
