/**
 * Rollback Panel — Deploy history and one-click rollback for Avengers Tower.
 * Loaded by tower.html. Renders as a collapsible sidebar panel.
 */

(function () {
  'use strict';

  var panel = document.getElementById('rollback-panel');
  var toggleBtn = document.getElementById('btn-toggle-rollback');
  var deployList = document.getElementById('deploy-list');
  var rollbackStatus = document.getElementById('rollback-status');

  if (!panel || !toggleBtn || !deployList) return;

  var projectId = new URLSearchParams(window.location.search).get('project') || '';
  var isOpen = false;

  function escapeHtml(str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'Unknown';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  toggleBtn.addEventListener('click', function () {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) loadDeploys();
  });

  async function loadDeploys() {
    if (!projectId) {
      deployList.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">No project selected</div>';
      return;
    }

    deployList.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">Loading deploy history...</div>';

    try {
      var res = await fetch('/api/projects/get?id=' + encodeURIComponent(projectId));
      var body = await res.json();
      if (!res.ok || !body.data) {
        deployList.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">Could not load project</div>';
        return;
      }

      var project = body.data;

      // Viewers cannot see deploy details
      if (project.userRole === 'viewer') {
        deployList.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">Deploy history requires deployer access</div>';
        return;
      }
      deployList.innerHTML = '';

      if (!project.lastDeployAt) {
        deployList.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">No deploys yet</div>';
        return;
      }

      // Show the last known deploy as an entry
      var entry = document.createElement('div');
      entry.className = 'deploy-entry';
      entry.innerHTML =
        '<div class="deploy-meta">' +
        '<span class="deploy-time">' + escapeHtml(timeAgo(project.lastDeployAt)) + '</span>' +
        '<span class="deploy-target badge deploy">' + escapeHtml(project.deployTarget) + '</span>' +
        '</div>' +
        '<div class="deploy-url">' + (project.deployUrl ? escapeHtml(project.deployUrl) : 'No URL') + '</div>';

      deployList.appendChild(entry);

      // Note: full deploy history requires ~/.voidforge/deploys/ integration (future enhancement)
      var note = document.createElement('div');
      note.style.cssText = 'color: var(--text-dim); font-size: 11px; padding: 8px; border-top: 1px solid var(--border);';
      note.textContent = 'Full deploy history coming in a future update.';
      deployList.appendChild(note);

    } catch (err) {
      deployList.innerHTML = '<div style="color: var(--error); font-size: 12px; padding: 8px;">Failed to load: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // Keyboard: Escape closes panel
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      isOpen = false;
      panel.classList.remove('open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.focus();
    }
  });
})();
