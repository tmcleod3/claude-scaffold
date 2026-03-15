/**
 * The Great Hall — Multi-project dashboard for VoidForge Camelot.
 * Fetches project list, renders cards, handles navigation and import.
 */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────
  let projects = [];
  let pollTimer = null;
  let previousFocusEl = null; // For modal focus restoration
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

  // ── API helpers ────────────────────────────────────

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) return [];
      const body = await res.json();
      return body.data || [];
    } catch {
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

    const sshBtn = project.sshHost
      ? `<button class="btn" data-action="ssh" data-id="${escapeHtml(project.id)}" title="SSH to production">SSH</button>`
      : '';

    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-name">${escapeHtml(project.name)}</div>
        <div class="health-indicator" title="${escapeHtml(healthTitle)}" role="img" aria-label="Health: ${escapeHtml(healthTitle)}">
          <span class="health-label">${escapeHtml(healthLabels[healthStatus] || '—')}</span>
          <div class="health-dot ${escapeHtml(healthStatus)}"></div>
        </div>
      </div>
      ${urlHtml}
      <div class="badge-row">
        <span class="badge">${escapeHtml(project.framework || 'unknown')}</span>
        <span class="badge deploy">${escapeHtml(project.deployTarget || 'unknown')}</span>
        ${project.database && project.database !== 'none' ? `<span class="badge">${escapeHtml(project.database)}</span>` : ''}
      </div>
      <div class="project-actions">
        <button class="btn btn-primary" data-action="open" data-id="${escapeHtml(project.id)}" title="Open terminal workspace">Open Room</button>
        ${sshBtn}
        <button class="btn btn-danger-ghost" data-action="remove" data-id="${escapeHtml(project.id)}" title="Remove from registry (does not delete files)">Remove</button>
      </div>
      <div class="project-footer">
        <span>${project.monthlyCost ? '$' + escapeHtml(String(project.monthlyCost)) + '/mo' : ''}</span>
        <span>${project.lastDeployAt ? 'Deployed ' + escapeHtml(timeAgo(project.lastDeployAt)) : 'Phase ' + escapeHtml(String(project.lastBuildPhase || 0))}</span>
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
      });
    });

    return card;
  }

  function render() {
    // Clear existing cards (keep empty state for reference)
    const existing = grid.querySelectorAll('.project-card');
    existing.forEach((el) => el.remove());

    if (projects.length === 0) {
      emptyState.style.display = '';
    } else {
      emptyState.style.display = 'none';
      for (const project of projects) {
        grid.appendChild(renderCard(project));
      }
    }

    // Update stats
    statProjects.textContent = projects.length + ' project' + (projects.length !== 1 ? 's' : '');
    const totalCost = projects.reduce((sum, p) => sum + (p.monthlyCost || 0), 0);
    statCost.textContent = totalCost > 0 ? '$' + totalCost + '/mo' : '$0/mo';
  }

  // ── Navigation ─────────────────────────────────────

  function openRoom(project, mode) {
    const params = new URLSearchParams({
      project: project.id,
      name: project.name,
      dir: project.directory,
    });
    if (mode === 'ssh' && project.sshHost) {
      params.set('ssh', project.sshHost);
    }
    window.location.href = '/camelot.html?' + params.toString();
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
    if (!confirm('Remove "' + project.name + '" from the Great Hall?\n\nThis only removes it from the registry — project files are not deleted.')) {
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

  // ── Event Listeners ────────────────────────────────

  document.getElementById('btn-new').addEventListener('click', () => {
    window.location.href = '/index.html';
  });

  document.getElementById('btn-new-empty').addEventListener('click', () => {
    window.location.href = '/index.html';
  });

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

  // ── Init ───────────────────────────────────────────

  async function init() {
    projects = await fetchProjects();
    render();

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
