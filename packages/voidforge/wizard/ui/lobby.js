/**
 * The Lobby — Multi-project dashboard for VoidForge Avengers Tower.
 * Fetches project list, renders cards, handles navigation and import.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────
  let projects = [];
  let pollTimer = null;
  let previousFocusEl = null; // For modal focus restoration
  let currentUser = { username: '', role: '' };
  let fetchFailed = false; // Distinguish "no projects" from "server error"
  const REFRESH_INTERVAL_MS = 30_000; // 30 seconds

  // ── DOM refs ───────────────────────────────────────
  const grid = document.getElementById('project-grid');
  const emptyState = document.getElementById('empty-state');
  const importModal = document.getElementById('import-modal');
  const importDir = document.getElementById('import-dir');
  const importStatus = document.getElementById('import-status');
  const importConfirm = document.getElementById('import-confirm');
  const importCancel = document.getElementById('import-cancel');
  const statProjects = document.getElementById('stat-projects');
  const statCost = document.getElementById('stat-cost');

  // ── Build status helper ───────────────────────────
  function getBuildStatus(project) {
    // deployUrl alone isn't proof of deployment — it's set during wizard setup as the intended domain.
    // lastDeployAt confirms an actual deploy happened.
    if (project.deployUrl && project.lastDeployAt) return { label: 'Live', action: 'Open Room', badge: 'success', auto: '' };
    if (project.lastBuildPhase >= 13) return { label: 'Built', action: 'Open Room', badge: 'info', auto: '' };
    if (project.lastBuildPhase > 0) return { label: 'Phase ' + project.lastBuildPhase + '/13', action: 'Return to the Shire', badge: 'warning', auto: 'campaign --resume' };
    return { label: 'Ready', action: 'Engage', badge: 'accent', auto: 'campaign' };
  }

  // ── API helpers ────────────────────────────────────

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) {
        fetchFailed = true;
        return [];
      }
      const body = await res.json();
      fetchFailed = false;
      return body.data || [];
    } catch {
      fetchFailed = true;
      return [];
    }
  }

  async function importProject(directory) {
    const res = await fetch('/api/projects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
      body: JSON.stringify({ directory }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Import failed');
    return body.data;
  }

  async function deleteProject(id) {
    const res = await fetch('/api/projects/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'Delete failed');
    }
  }

  // ── Rendering ──────────────────────────────────────

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  function renderCard(project) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.dataset.projectId = project.id;

    const healthStatus = project.healthStatus || 'unchecked';
    const healthLabels = { healthy: 'Up', degraded: 'Warn', down: 'Down', unchecked: '—' };
    const healthTitle = healthStatus === 'unchecked'
      ? 'No health check configured'
      : healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1);

    const urlHtml = project.deployUrl
      ? `<a href="${escapeHtml(project.deployUrl)}" class="project-url" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(project.deployUrl)}</a>`
      : '<span class="project-url" style="color: var(--text-muted)">Not deployed</span>';

    // Role badge for this project
    const userRole = project.userRole || 'viewer';

    const sshBtn = project.sshHost && userRole !== 'viewer'
      ? `<button class="btn" data-action="ssh" data-id="${escapeHtml(project.id)}" title="SSH to production">SSH</button>`
      : '';
    const roleLabels = { owner: 'Owner', admin: 'Admin', deployer: 'Deployer', viewer: 'Viewer' };
    const roleBadgeClass = userRole === 'owner' ? 'role-owner' : 'role-' + userRole;

    // Build status drives button label and auto-command
    const buildStatus = getBuildStatus(project);

    // Conditional action buttons based on role
    const canOpenRoom = userRole !== 'viewer';
    const canRemove = userRole === 'owner' || userRole === 'admin';
    const canManageAccess = userRole === 'owner' || userRole === 'admin';

    // Contextual tooltips for build-state buttons
    const tooltips = {
      'Engage': 'Begin building this project — "Make it so."',
      'Return to the Shire': 'Resume the campaign with fresh context — pick up where you left off',
      'Open Room': 'Open the terminal workspace',
    };
    const tooltip = tooltips[buildStatus.action] || 'Open terminal workspace';

    const openBtn = canOpenRoom
      ? `<button class="btn btn-primary" data-action="open" data-id="${escapeHtml(project.id)}" data-auto="${escapeHtml(buildStatus.auto)}" title="${escapeHtml(tooltip)}">${escapeHtml(buildStatus.action)}</button>`
      : '';
    const removeBtn = canRemove
      ? `<button class="btn btn-danger-ghost" data-action="remove" data-id="${escapeHtml(project.id)}" title="Remove from registry (does not delete files)">Remove</button>`
      : '';
    const accessBtn = canManageAccess
      ? `<button class="btn" data-action="access" data-id="${escapeHtml(project.id)}" title="Manage project access">Access</button>`
      : '';
    const linkBtn = canManageAccess
      ? `<button class="btn" data-action="link" data-id="${escapeHtml(project.id)}" title="Link to another project">Link</button>`
      : '';

    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-name">${escapeHtml(project.name)}</div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="badge ${escapeHtml(roleBadgeClass)} user-role-badge">${escapeHtml(roleLabels[userRole] || 'Viewer')}</span>
          <div class="health-indicator" title="${escapeHtml(healthTitle)}" role="img" aria-label="Health: ${escapeHtml(healthTitle)}">
            <span class="health-label">${escapeHtml(healthLabels[healthStatus] || '—')}</span>
            <div class="health-dot ${escapeHtml(healthStatus)}"></div>
          </div>
        </div>
      </div>
      ${urlHtml}
      <div class="badge-row">
        <span class="badge">${escapeHtml(project.framework || 'unknown')}</span>
        <span class="badge deploy">${escapeHtml(project.deployTarget || 'unknown')}</span>
        ${project.database && project.database !== 'none' ? `<span class="badge">${escapeHtml(project.database)}</span>` : ''}
        ${project.linkedProjects && project.linkedProjects.length > 0 ? `<span class="badge linked">Linked: ${escapeHtml(String(project.linkedProjects.length))}</span>` : ''}
      </div>
      <div class="project-actions">
        ${openBtn}
        ${sshBtn}
        ${linkBtn}
        ${accessBtn}
        ${removeBtn}
      </div>
      <div class="project-footer">
        <span>${project.monthlyCost ? '$' + escapeHtml(String(project.monthlyCost)) + '/mo' : ''}</span>
        <span class="badge build-${escapeHtml(buildStatus.badge)}">${escapeHtml(buildStatus.label)}</span>
        <span>${project.lastDeployAt ? 'Deployed ' + escapeHtml(timeAgo(project.lastDeployAt)) : ''}</span>
      </div>
    `;

    // Card click → open room (unless clicking a button or link)
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      openRoom(project);
    });

    // Keyboard: Enter/Space on card opens room
    card.addEventListener('keydown', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openRoom(project);
      }
    });

    // Button handlers
    card.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const p = projects.find((proj) => proj.id === id);
        if (!p) return;

        if (action === 'open') openRoom(p);
        else if (action === 'ssh') openRoom(p, 'ssh');
        else if (action === 'remove') handleRemove(p);
        else if (action === 'access') openAccessModal(p);
        else if (action === 'link') openLinkModal(p);
      });
    });

    return card;
  }

  function render() {
    // Clear existing cards and error state (keep empty state for reference)
    const existing = grid.querySelectorAll('.project-card');
    existing.forEach((el) => el.remove());
    const existingError = grid.querySelector('.error-state');
    if (existingError) existingError.remove();

    if (fetchFailed && projects.length === 0) {
      emptyState.style.display = 'none';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-state';
      errorDiv.setAttribute('role', 'alert');
      errorDiv.setAttribute('aria-live', 'polite');
      errorDiv.style.cssText = 'text-align: center; padding: 80px 24px; color: var(--text-dim); grid-column: 1 / -1;';
      errorDiv.innerHTML =
        '<h2 style="color: var(--error, #ef4444); margin-bottom: 8px;">Could not connect to server</h2>' +
        '<p style="margin-bottom: 24px;">The Lobby could not reach VoidForge. Check that the server is running.</p>' +
        '<button class="btn" id="btn-retry-fetch">Retry</button>';
      grid.appendChild(errorDiv);
      document.getElementById('btn-retry-fetch').addEventListener('click', async () => {
        projects = await fetchProjects();
        render();
      });
    } else if (projects.length === 0) {
      emptyState.style.display = '';
    } else {
      emptyState.style.display = 'none';
      for (const project of projects) {
        grid.appendChild(renderCard(project));
      }
    }

    // Update stats from API for accurate cost aggregation
    statProjects.textContent = projects.length + ' project' + (projects.length !== 1 ? 's' : '');
    fetchCosts();
  }

  async function fetchCosts() {
    try {
      const res = await fetch('/api/projects/costs');
      if (!res.ok) return;
      const body = await res.json();
      const data = body.data || {};
      statCost.textContent = data.totalMonthlyCost > 0 ? '$' + data.totalMonthlyCost + '/mo' : '$0/mo';
    } catch {
      const fallback = projects.reduce(function (sum, p) { return sum + (p.monthlyCost || 0); }, 0);
      statCost.textContent = fallback > 0 ? '$' + fallback + '/mo' : '$0/mo';
    }
  }

  // ── Navigation ─────────────────────────────────────

  function openRoom(project, mode) {
    if (mode === 'ssh' && project.sshHost) {
      // SSH goes directly to Tower (no project dashboard needed)
      const params = new URLSearchParams({
        project: project.id,
        name: project.name,
        dir: project.directory,
        ssh: project.sshHost,
      });
      window.location.href = '/tower.html?' + params.toString();
      return;
    }

    // Navigate to project dashboard (v22.0)
    const params = new URLSearchParams({
      id: project.id,
      name: project.name,
      dir: project.directory,
    });
    const buildStatus = getBuildStatus(project);
    if (buildStatus.auto) {
      params.set('auto', buildStatus.auto);
    }
    window.location.href = '/project.html?' + params.toString();
  }

  // ── Import Modal (with focus trap) ─────────────────

  function getFocusableElements() {
    const modal = importModal.querySelector('.modal');
    if (!modal) return [];
    return Array.from(modal.querySelectorAll(
      'input, button, [tabindex]:not([tabindex="-1"])'
    )).filter((el) => !el.disabled);
  }

  function trapFocus(e) {
    if (!importModal.classList.contains('active')) return;
    if (e.key === 'Escape') {
      closeImportModal();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function openImportModal() {
    previousFocusEl = document.activeElement;
    importDir.value = '';
    importStatus.textContent = '';
    importStatus.className = 'status-row';
    importModal.classList.add('active');
    importDir.focus();
    document.addEventListener('keydown', trapFocus);
  }

  function closeImportModal() {
    importModal.classList.remove('active');
    document.removeEventListener('keydown', trapFocus);
    // Restore focus to trigger element
    if (previousFocusEl && previousFocusEl.focus) {
      previousFocusEl.focus();
      previousFocusEl = null;
    }
  }

  async function handleImport() {
    const dir = importDir.value.trim();
    if (!dir) {
      importStatus.textContent = 'Please enter a directory path';
      importStatus.className = 'status-row error';
      return;
    }

    if (!dir.startsWith('/')) {
      importStatus.textContent = 'Path must be absolute (start with /)';
      importStatus.className = 'status-row error';
      return;
    }

    importConfirm.disabled = true;
    importStatus.textContent = 'Scanning project...';
    importStatus.className = 'status-row loading';

    try {
      const project = await importProject(dir);
      projects.push(project);
      render();
      closeImportModal();
    } catch (err) {
      importStatus.textContent = err.message;
      importStatus.className = 'status-row error';
    } finally {
      importConfirm.disabled = false;
    }
  }

  async function handleRemove(project) {
    if (!confirm('Remove "' + project.name + '" from The Lobby?\n\nThis only removes it from the registry — project files are not deleted.')) {
      return;
    }

    try {
      await deleteProject(project.id);
      projects = projects.filter((p) => p.id !== project.id);
      render();
    } catch (err) {
      alert('Failed to remove: ' + err.message);
    }
  }

  // ── Access Modal ───────────────────────────────────

  const accessModal = document.getElementById('access-modal');
  const accessOwner = document.getElementById('access-owner');
  const accessList = document.getElementById('access-list');
  const accessUsername = document.getElementById('access-username');
  const accessRole = document.getElementById('access-role');
  const accessStatus = document.getElementById('access-status');
  const accessGrant = document.getElementById('access-grant');
  const accessCancel = document.getElementById('access-cancel');
  let currentAccessProjectId = '';

  async function openAccessModal(project) {
    currentAccessProjectId = project.id;
    accessUsername.value = '';
    accessStatus.textContent = '';
    accessStatus.className = 'status-row';

    try {
      const res = await fetch('/api/projects/access?id=' + encodeURIComponent(project.id));
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load access');
      const data = body.data;

      accessOwner.textContent = 'Owner: ' + (data.owner || 'unassigned');

      if (data.access.length === 0) {
        accessList.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">No shared access</div>';
      } else {
        accessList.innerHTML = '';
        data.access.forEach(function (entry) {
          const row = document.createElement('div');
          row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0;';
          const label = document.createElement('span');
          label.textContent = entry.username + ' ';
          const badge = document.createElement('span');
          badge.className = 'badge role-' + (entry.role || 'viewer') + ' user-role-badge';
          badge.textContent = entry.role;
          label.appendChild(badge);
          const revokeBtn = document.createElement('button');
          revokeBtn.className = 'btn btn-danger-ghost';
          revokeBtn.style.cssText = 'padding: 2px 6px; font-size: 10px;';
          revokeBtn.textContent = 'Revoke';
          revokeBtn.addEventListener('click', function () {
            revokeProjectAccess(entry.username);
          });
          row.appendChild(label);
          row.appendChild(revokeBtn);
          accessList.appendChild(row);
        });
      }
    } catch (err) {
      accessOwner.textContent = '';
      accessList.innerHTML = '<div class="status-row error">' + escapeHtml(err.message) + '</div>';
    }

    previousFocusEl = document.activeElement;
    accessModal.classList.add('active');
    accessUsername.focus();
    document.addEventListener('keydown', trapAccessFocus);
  }

  function trapAccessFocus(e) {
    if (!accessModal.classList.contains('active')) return;
    if (e.key === 'Escape') {
      closeAccessModal();
      return;
    }
    if (e.key !== 'Tab') return;
    const modal = accessModal.querySelector('.modal');
    if (!modal) return;
    const focusable = Array.from(modal.querySelectorAll(
      'input, select, button, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return !el.disabled; });
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function closeAccessModal() {
    accessModal.classList.remove('active');
    document.removeEventListener('keydown', trapAccessFocus);
    if (previousFocusEl && previousFocusEl.focus) {
      previousFocusEl.focus();
      previousFocusEl = null;
    }
  }

  async function handleGrantAccess() {
    const username = accessUsername.value.trim();
    if (!username) {
      accessStatus.textContent = 'Username is required';
      accessStatus.className = 'status-row error';
      return;
    }

    accessGrant.disabled = true;
    try {
      const res = await fetch('/api/projects/access/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ projectId: currentAccessProjectId, username: username, role: accessRole.value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to grant access');
      // Refresh the access list
      const project = projects.find(function (p) { return p.id === currentAccessProjectId; });
      if (project) await openAccessModal(project);
    } catch (err) {
      accessStatus.textContent = err.message;
      accessStatus.className = 'status-row error';
    } finally {
      accessGrant.disabled = false;
    }
  }

  async function revokeProjectAccess(username) {
    try {
      const res = await fetch('/api/projects/access/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ projectId: currentAccessProjectId, username: username }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to revoke');
      // Refresh
      const project = projects.find(function (p) { return p.id === currentAccessProjectId; });
      if (project) await openAccessModal(project);
    } catch (err) {
      alert('Failed to revoke: ' + err.message);
    }
  }

  if (accessCancel) accessCancel.addEventListener('click', closeAccessModal);
  if (accessGrant) accessGrant.addEventListener('click', handleGrantAccess);
  if (accessModal) {
    accessModal.addEventListener('click', function (e) {
      if (e.target === accessModal) closeAccessModal();
    });
  }
  if (accessUsername) {
    accessUsername.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleGrantAccess();
    });
  }

  // ── Link Modal ─────────────────────────────────────

  const linkModal = document.getElementById('link-modal');
  const linkCurrent = document.getElementById('link-current');
  const linkExisting = document.getElementById('link-existing');
  const linkSelect = document.getElementById('link-select');
  const linkStatus = document.getElementById('link-status');
  const linkConfirm = document.getElementById('link-confirm');
  const linkCancel = document.getElementById('link-cancel');
  let currentLinkProjectId = '';

  async function openLinkModal(project) {
    currentLinkProjectId = project.id;
    linkStatus.textContent = '';
    linkStatus.className = 'status-row';
    linkCurrent.textContent = 'Project: ' + project.name;

    // Show existing links
    if (project.linkedProjects && project.linkedProjects.length > 0) {
      const linkedNames = project.linkedProjects.map(function (lid) {
        const lp = projects.find(function (p) { return p.id === lid; });
        return lp ? lp.name : lid;
      });
      linkExisting.innerHTML = '';
      linkedNames.forEach(function (name, i) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 4px 0;';
        const label = document.createElement('span');
        label.textContent = name;
        const unlinkBtn = document.createElement('button');
        unlinkBtn.className = 'btn btn-danger-ghost';
        unlinkBtn.style.cssText = 'padding: 2px 6px; font-size: 10px;';
        unlinkBtn.textContent = 'Unlink';
        unlinkBtn.addEventListener('click', function () {
          handleUnlink(project.linkedProjects[i]);
        });
        row.appendChild(label);
        row.appendChild(unlinkBtn);
        linkExisting.appendChild(row);
      });
    } else {
      linkExisting.innerHTML = '<div style="color: var(--text-dim); font-size: 12px;">No linked projects</div>';
    }

    // Populate dropdown with other projects the user can link to
    linkSelect.innerHTML = '';
    const linkable = projects.filter(function (p) {
      return p.id !== project.id &&
        (p.userRole === 'owner' || p.userRole === 'admin') &&
        (!project.linkedProjects || !project.linkedProjects.includes(p.id));
    });
    if (linkable.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No projects available to link';
      linkSelect.appendChild(opt);
      linkConfirm.disabled = true;
    } else {
      linkConfirm.disabled = false;
      linkable.forEach(function (p) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        linkSelect.appendChild(opt);
      });
    }

    previousFocusEl = document.activeElement;
    linkModal.classList.add('active');
    linkSelect.focus();
    document.addEventListener('keydown', trapLinkFocus);
  }

  function trapLinkFocus(e) {
    if (!linkModal.classList.contains('active')) return;
    if (e.key === 'Escape') {
      closeLinkModal();
      return;
    }
    if (e.key !== 'Tab') return;
    var modal = linkModal.querySelector('.modal');
    if (!modal) return;
    var focusable = Array.from(modal.querySelectorAll(
      'select, button, [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return !el.disabled; });
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function closeLinkModal() {
    linkModal.classList.remove('active');
    document.removeEventListener('keydown', trapLinkFocus);
    if (previousFocusEl && previousFocusEl.focus) {
      previousFocusEl.focus();
      previousFocusEl = null;
    }
  }

  async function handleLink() {
    const targetId = linkSelect.value;
    if (!targetId) return;

    linkConfirm.disabled = true;
    try {
      const res = await fetch('/api/projects/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ projectIdA: currentLinkProjectId, projectIdB: targetId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to link');
      // Refresh projects and reopen modal
      projects = await fetchProjects();
      render();
      const updated = projects.find(function (p) { return p.id === currentLinkProjectId; });
      if (updated) openLinkModal(updated);
    } catch (err) {
      linkStatus.textContent = err.message;
      linkStatus.className = 'status-row error';
    } finally {
      linkConfirm.disabled = false;
    }
  }

  async function handleUnlink(targetId) {
    try {
      const res = await fetch('/api/projects/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-VoidForge-Request': '1' },
        body: JSON.stringify({ projectIdA: currentLinkProjectId, projectIdB: targetId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to unlink');
      projects = await fetchProjects();
      render();
      const updated = projects.find(function (p) { return p.id === currentLinkProjectId; });
      if (updated) openLinkModal(updated);
    } catch (err) {
      alert('Failed to unlink: ' + err.message);
    }
  }

  if (linkCancel) linkCancel.addEventListener('click', closeLinkModal);
  if (linkConfirm) linkConfirm.addEventListener('click', handleLink);
  if (linkModal) {
    linkModal.addEventListener('click', function (e) {
      if (e.target === linkModal) closeLinkModal();
    });
  }

  // ── Event Listeners ────────────────────────────────

  document.getElementById('btn-new').addEventListener('click', () => {
    window.location.href = '/index.html';
  });

  document.getElementById('btn-new-empty').addEventListener('click', () => {
    window.location.href = '/index.html';
  });

  // v22.2 M1: Import button in empty state
  const btnImportEmpty = document.getElementById('btn-import-empty');
  if (btnImportEmpty) {
    btnImportEmpty.addEventListener('click', openImportModal);
  }

  document.getElementById('btn-import').addEventListener('click', openImportModal);
  importCancel.addEventListener('click', closeImportModal);
  importConfirm.addEventListener('click', handleImport);

  // Close modal on backdrop click
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
  });

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && importModal.classList.contains('active')) {
      closeImportModal();
    }
  });

  // Import on Enter
  importDir.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleImport();
  });

  // ── Auth UI ─────────────────────────────────────────

  const authUser = document.getElementById('auth-user');
  const btnLogout = document.getElementById('btn-logout');

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/session');
      const body = await res.json();
      const data = body.data || {};
      if ((data.remoteMode || data.lanMode) && data.authenticated) {
        currentUser = { username: data.username || '', role: data.role || 'viewer' };
        const roleLabel = { admin: 'Admin', deployer: 'Deployer', viewer: 'Viewer' }[data.role] || '';
        authUser.textContent = data.username + (roleLabel ? ' (' + roleLabel + ')' : '');
        authUser.style.display = '';
        btnLogout.style.display = '';
      }
      if ((data.remoteMode || data.lanMode) && !data.authenticated) {
        window.location.href = '/login.html';
      }
    } catch { /* local mode — no auth needed */ }
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'X-VoidForge-Request': '1' },
      });
      window.location.href = '/login.html';
    });
  }

  // ── Init ───────────────────────────────────────────

  // ── Restart detection ────────────────────────────────
  async function checkServerRestart() {
    try {
      const res = await fetch('/api/server/status', { headers: { 'X-VoidForge-Request': '1' } });
      const data = await res.json();
      if (data.needsRestart) {
        showRestartBanner();
      }
    } catch { /* non-fatal */ }
  }

  function showRestartBanner() {
    if (document.getElementById('restart-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'restart-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'background:#2d1b00;border:1px solid #f59e0b;color:#fbbf24;padding:12px 16px;margin:0 0 16px;border-radius:8px;';

    const msg = document.createElement('span');
    msg.textContent = 'VoidForge updated \u2014 native modules changed on disk. Restart the server (Ctrl+C, then re-run) for changes to take effect.';
    banner.appendChild(msg);

    const header = document.querySelector('.lobby-header');
    if (header) header.after(banner);
  }

  function showResumeLink() {
    try {
      const last = JSON.parse(localStorage.getItem('voidforge-last-project') || 'null');
      if (!last || !last.id) return;
      const header = document.querySelector('.lobby-header');
      if (!header) return;
      const link = document.createElement('a');
      link.href = '/project.html?id=' + encodeURIComponent(last.id) + '&name=' + encodeURIComponent(last.name);
      link.textContent = 'Resume: ' + last.name;
      link.style.cssText = 'font-size: 13px; color: var(--accent); text-decoration: none; margin-left: 12px;';
      link.addEventListener('mouseenter', function () { link.style.textDecoration = 'underline'; });
      link.addEventListener('mouseleave', function () { link.style.textDecoration = 'none'; });
      header.querySelector('.lobby-actions')?.prepend(link);
    } catch { /* localStorage unavailable or corrupted */ }
  }

  async function init() {
    await checkAuth();
    showResumeLink();
    projects = await fetchProjects();
    render();
    await checkServerRestart();

    // Start polling for health updates
    pollTimer = setInterval(async () => {
      projects = await fetchProjects();
      render();
    }, REFRESH_INTERVAL_MS);
  }

  // Clean up on page leave
  window.addEventListener('beforeunload', () => {
    if (pollTimer) clearInterval(pollTimer);
  });

  init();
})();
