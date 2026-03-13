/**
 * Deploy wizard API routes — project scanning for Strange.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { addRoute } from '../router.js';
import { parseJsonBody } from '../lib/body-parser.js';
import { parseFrontmatter } from '../lib/frontmatter.js';
import { recommendInstanceType } from '../lib/instance-sizing.js';

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// POST /api/deploy/scan — scan a project directory for deploy info
addRoute('POST', '/api/deploy/scan', async (req: IncomingMessage, res: ServerResponse) => {
  const body = await parseJsonBody(req) as { directory?: string };

  if (!body.directory) {
    sendJson(res, 400, { error: 'directory is required' });
    return;
  }

  const dir = body.directory;

  // Check directory exists
  try {
    await access(dir);
  } catch {
    sendJson(res, 400, { error: `Directory not found: ${dir}` });
    return;
  }

  // Check it's a VoidForge project (has CLAUDE.md)
  try {
    await access(join(dir, 'CLAUDE.md'));
  } catch {
    sendJson(res, 400, { error: 'Not a VoidForge project — no CLAUDE.md found' });
    return;
  }

  // Read project name from CLAUDE.md
  let name = 'Unknown';
  try {
    const claudeMd = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    const nameMatch = claudeMd.match(/\*\*Name:\*\*\s*(.+)/);
    if (nameMatch) {
      const extracted = nameMatch[1].trim();
      if (!extracted.startsWith('[')) name = extracted;
    }
  } catch { /* use default */ }

  // Read deploy target from .env
  let deploy = '';
  try {
    const envContent = await readFile(join(dir, '.env'), 'utf-8');
    const deployMatch = envContent.match(/DEPLOY_TARGET=(.+)/);
    if (deployMatch) {
      deploy = deployMatch[1].trim().replace(/^["']|["']$/g, '').split('#')[0].trim();
    }
  } catch { /* no .env yet */ }

  // Read framework/database/cache from PRD frontmatter
  let framework = '';
  let database = 'none';
  let cache = 'none';
  let instanceType = '';
  let hostname = '';
  let prdFrontmatter: Record<string, string | undefined> = {};
  try {
    const prd = await readFile(join(dir, 'docs', 'PRD.md'), 'utf-8');
    const { frontmatter } = parseFrontmatter(prd);
    prdFrontmatter = frontmatter;
    if (frontmatter.framework) framework = frontmatter.framework;
    if (frontmatter.database) database = frontmatter.database;
    if (frontmatter.cache) cache = frontmatter.cache;
    if (frontmatter.deploy && !deploy) deploy = frontmatter.deploy;
    if (frontmatter.instance_type) instanceType = frontmatter.instance_type;
    if (frontmatter.hostname) hostname = frontmatter.hostname;
  } catch { /* no PRD or no frontmatter */ }

  // Also check .env for hostname if not in PRD
  if (!hostname) {
    try {
      const envContent = await readFile(join(dir, '.env'), 'utf-8');
      const hostnameMatch = envContent.match(/HOSTNAME=(.+)/);
      if (hostnameMatch) {
        hostname = hostnameMatch[1].trim().replace(/^["']|["']$/g, '').split('#')[0].trim();
      }
    } catch { /* no .env */ }
  }

  // Auto-detect framework from files if not in PRD
  if (!framework) {
    try {
      const pkg = await readFile(join(dir, 'package.json'), 'utf-8');
      const pkgData = JSON.parse(pkg) as { dependencies?: Record<string, string> };
      const deps = pkgData.dependencies || {};
      if (deps['next']) framework = 'next.js';
      else if (deps['express']) framework = 'express';
    } catch { /* not a Node project */ }

    if (!framework) {
      try {
        const reqs = await readFile(join(dir, 'requirements.txt'), 'utf-8');
        const reqsLower = reqs.toLowerCase();
        if (reqsLower.includes('django')) framework = 'django';
        else framework = 'python';
      } catch { /* not Python */ }
    }

    if (!framework) {
      try {
        await access(join(dir, 'Gemfile'));
        framework = 'rails';
      } catch { /* not Ruby */ }
    }
  }

  // Auto-recommend instance type from PRD scope if not explicitly set
  if (!instanceType && (deploy === 'vps' || !deploy)) {
    instanceType = recommendInstanceType({
      type: prdFrontmatter.type,
      framework,
      database,
      cache,
      workers: prdFrontmatter.workers,
      payments: prdFrontmatter.payments,
    });
  }

  sendJson(res, 200, {
    valid: true,
    name,
    deploy: deploy || 'docker',
    framework,
    database,
    cache,
    instanceType: instanceType || 't3.micro',
    hostname: hostname || '',
  });
});
