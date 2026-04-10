/**
 * Provisioning API — deploy history, incomplete run detection.
 * Split from provision.ts for file size (v23.3).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { addRoute } from '../router.js';
import { getSessionPassword } from './credentials.js';
import { listDeploys } from '../lib/deploy-log.js';
import { listIncompleteRuns } from '../lib/provision-manifest.js';
import { sendJson } from '../lib/http-helpers.js';

// GET /api/deploys — list recent deploy history (ADR-021)
addRoute('GET', '/api/deploys', async (_req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const deploys = await listDeploys();
  sendJson(res, 200, {
    deploys: deploys.map(d => ({
      timestamp: d.timestamp,
      target: d.target,
      projectName: d.projectName,
      deployUrl: d.deployUrl,
      hostname: d.hostname,
      resourceCount: d.resources.length,
    })),
  });
});

// GET /api/provision/incomplete — check for orphaned runs from crashes
addRoute('GET', '/api/provision/incomplete', async (_req: IncomingMessage, res: ServerResponse) => {
  const password = getSessionPassword();
  if (!password) {
    sendJson(res, 401, { error: 'Vault is locked.' });
    return;
  }

  const incomplete = await listIncompleteRuns();
  sendJson(res, 200, {
    runs: incomplete.map((m) => ({
      runId: m.runId,
      startedAt: m.startedAt,
      target: m.target,
      projectName: m.projectName,
      resourceCount: m.resources.filter((r) => r.status === 'created').length,
      resources: m.resources.filter((r) => r.status === 'created').map((r) => `${r.type}: ${r.id}`),
    })),
  });
});
