/**
 * danger-room.js — Redirect stub (ADR-046)
 *
 * The standalone Danger Room page is deprecated (v22.2 M3).
 * Legacy /api/danger-room/* endpoints have been removed.
 * This script redirects users to the project dashboard (project.html#danger-room)
 * or to the lobby if no project ID is available.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var projectId = params.get('project');

  var msgEl = document.getElementById('redirect-message');
  if (msgEl) {
    msgEl.textContent = projectId
      ? 'Redirecting to project dashboard...'
      : 'Redirecting to lobby...';
  }

  setTimeout(function () {
    if (projectId) {
      location.href = '/project.html?id=' + encodeURIComponent(projectId) + '#danger-room';
    } else {
      location.href = '/lobby.html';
    }
  }, 1000);
})();
