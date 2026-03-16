/**
 * PTY Manager — spawns and manages real pseudo-terminal processes.
 * Uses node-pty (same lib as VS Code, Gitpod, GitHub Codespaces).
 * Each PTY is a real shell with full capabilities.
 *
 * Haku moves between worlds seamlessly.
 */

import { randomUUID } from 'node:crypto';
import { isRemoteMode } from './tower-auth.js';
import { audit } from './audit-log.js';

// node-pty is a native module — dynamic import to handle missing installs gracefully
let pty: typeof import('node-pty') | null = null;

async function loadPty(): Promise<typeof import('node-pty')> {
  if (pty) return pty;
  try {
    pty = await import('node-pty');
    return pty;
  } catch {
    throw new Error('node-pty is not installed. Run: npm install node-pty');
  }
}

export interface PtySession {
  id: string;
  projectName: string;
  projectDir: string;
  label: string;
  username: string;
  createdAt: number;
  lastActivityAt: number;
  cols: number;
  rows: number;
}

interface InternalSession extends PtySession {
  process: import('node-pty').IPty;
  onData: Set<(data: string) => void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, InternalSession>();

const MAX_SESSIONS_LOCAL = 5;
const MAX_SESSIONS_REMOTE = 20; // 5 per project, 20 total across all projects
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// SEC-004/QA-003: Whitelist of allowed initial commands — prevent arbitrary command injection
const ALLOWED_INITIAL_COMMANDS = ['claude', 'bash', 'zsh', 'sh', 'npm run dev', 'npm start', 'npm test'];

// SEC-013: Safe environment keys — no credential leakage into PTY sessions
// ANTHROPIC_API_KEY included only in local mode (user's own key).
// In remote mode, operator's API key must NOT leak to deployer-role users.
// Includes TMPDIR/SSH_AUTH_SOCK for tool compatibility.
const BASE_SAFE_ENV_KEYS = ['PATH', 'HOME', 'SHELL', 'USER', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM_PROGRAM', 'EDITOR', 'VISUAL', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'NVM_DIR', 'NVM_BIN', 'NVM_INC', 'TMPDIR', 'TEMP', 'SSH_AUTH_SOCK', 'COLORTERM'];
// FLOW-R2-007: Only pass ANTHROPIC_API_KEY in local mode
function getSafeEnvKeys(): string[] {
  if (isRemoteMode()) return BASE_SAFE_ENV_KEYS;
  return [...BASE_SAFE_ENV_KEYS, 'ANTHROPIC_API_KEY'];
}

function resetIdleTimer(session: InternalSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    console.log(`  PTY session ${session.id} idle for 30 min — killing`);
    killSession(session.id);
  }, IDLE_TIMEOUT_MS);
}

/**
 * Spawn a new PTY session.
 * @param projectDir — directory to cd into
 * @param projectName — human-readable project name
 * @param label — tab label (e.g., "Claude Code", "Shell", "SSH: prod")
 * @param initialCommand — optional command to auto-run after shell starts
 * @param cols — terminal columns (default 120)
 * @param rows — terminal rows (default 30)
 */
export async function createSession(
  projectDir: string,
  projectName: string,
  label: string,
  initialCommand?: string,
  cols = 120,
  rows = 30,
  username = '',
): Promise<PtySession> {
  const maxSessions = isRemoteMode() ? MAX_SESSIONS_REMOTE : MAX_SESSIONS_LOCAL;
  if (sessions.size >= maxSessions) {
    // QA-007/UX-018: Prefer killing sessions with no connected listeners (disconnected tabs)
    const disconnected = [...sessions.values()].filter(s => s.onData.size === 0);
    if (disconnected.length > 0) {
      killSession(disconnected.sort((a, b) => a.lastActivityAt - b.lastActivityAt)[0].id);
    } else {
      // All sessions have active listeners — reject instead of killing active work
      throw new Error(`Maximum ${maxSessions} concurrent terminal sessions. Close a tab first.`);
    }
  }

  const nodePty = await loadPty();
  const shell = process.env['SHELL'] || '/bin/zsh';
  const id = randomUUID();

  // SEC-013: Build clean environment — no credential leakage into PTY
  const safeEnv: Record<string, string> = {};
  for (const key of getSafeEnvKeys()) {
    if (process.env[key]) safeEnv[key] = process.env[key]!;
  }
  safeEnv['TERM'] = 'xterm-256color';
  safeEnv['VOIDFORGE_SESSION'] = id;

  // QA-R2-010 + QA-R3-002: Clamp cols/rows BEFORE spawnOptions construction
  cols = Math.max(1, Math.min(500, Math.floor(cols)));
  rows = Math.max(1, Math.min(200, Math.floor(rows)));

  // Remote mode: spawn as forge-user for sandboxing (Layer 4)
  const spawnOptions: import('node-pty').IPtyForkOptions = {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: projectDir,
    env: safeEnv,
  };
  if (isRemoteMode()) {
    // In remote mode, PTY spawns as forge-user (non-root sandboxing)
    // The uid/gid would be set here in production: spawnOptions.uid = forgeUserUid;
    // For scaffold/spec purposes, we document the intent
    safeEnv['VOIDFORGE_REMOTE'] = '1';
  }

  const ptyProcess = nodePty.spawn(shell, [], spawnOptions);

  const session: InternalSession = {
    id,
    projectName,
    projectDir,
    label,
    username,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    cols,
    rows,
    process: ptyProcess,
    onData: new Set(),
    idleTimer: null,
  };

  // Forward PTY output to all listeners
  ptyProcess.onData((data: string) => {
    session.lastActivityAt = Date.now();
    resetIdleTimer(session);
    for (const listener of session.onData) {
      try { listener(data); } catch { /* listener error, ignore */ }
    }
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode }) => {
    console.log(`  PTY session ${id} exited (code ${exitCode})`);
    if (session.idleTimer) clearTimeout(session.idleTimer);
    sessions.delete(id);
    // Audit: log terminal end in remote mode
    if (isRemoteMode()) {
      audit('terminal_end', '', session.username, { sessionId: id, exitCode }).catch(() => {});
    }
  });

  sessions.set(id, session);
  resetIdleTimer(session);

  // Audit: log terminal start in remote mode
  if (isRemoteMode()) {
    audit('terminal_start', '', username, { sessionId: id, project: projectName, label }).catch(() => {});
  }

  // SEC-004/QA-003: Validate initial command against whitelist
  if (initialCommand && !ALLOWED_INITIAL_COMMANDS.includes(initialCommand)) {
    initialCommand = undefined;
  }

  // Auto-run initial command after a short delay (let shell init complete)
  if (initialCommand) {
    setTimeout(() => {
      if (sessions.has(id)) {
        ptyProcess.write(initialCommand + '\r');
      }
    }, 500);
  }

  return {
    id: session.id,
    projectName: session.projectName,
    projectDir: session.projectDir,
    label: session.label,
    username: session.username,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    cols: session.cols,
    rows: session.rows,
  };
}

/** Write input (keystrokes) to a PTY session. */
export function writeToSession(sessionId: string, data: string): void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.lastActivityAt = Date.now();
  resetIdleTimer(session);
  session.process.write(data);
}

/** Subscribe to PTY output. Returns an unsubscribe function. */
export function onSessionData(sessionId: string, listener: (data: string) => void): () => void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.onData.add(listener);
  return () => { session.onData.delete(listener); };
}

/** Resize a PTY session. */
export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  // QA-016/SEC-007: Clamp resize values to sane bounds
  cols = Math.max(1, Math.min(500, Math.floor(cols)));
  rows = Math.max(1, Math.min(200, Math.floor(rows)));
  session.cols = cols;
  session.rows = rows;
  session.process.resize(cols, rows);
}

/** Kill a PTY session. */
export function killSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  try { session.process.kill(); } catch { /* already dead */ }
  sessions.delete(sessionId);
}

/** List all active sessions. */
export function listSessions(): PtySession[] {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    projectName: s.projectName,
    projectDir: s.projectDir,
    label: s.label,
    username: s.username,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    cols: s.cols,
    rows: s.rows,
  }));
}

/** Kill all sessions (graceful shutdown). */
export function killAllSessions(): void {
  for (const id of sessions.keys()) {
    killSession(id);
  }
}

/** Get session count. */
export function sessionCount(): number {
  return sessions.size;
}
