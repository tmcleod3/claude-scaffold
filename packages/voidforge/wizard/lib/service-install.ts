/**
 * Service Install — launchd/systemd/Task Scheduler integration (§9.18, §9.19.2).
 *
 * Creates system services for:
 * 1. Heartbeat daemon (com.voidforge.heartbeat)
 * 2. Wizard server (com.voidforge.server) — persistent when Cultivation is installed
 *
 * PRD Reference: §9.18 (macOS LaunchAgent), §9.19.2 (two services)
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');

// ── macOS LaunchAgent ─────────────────────────────────

function heartbeatPlist(): string {
  const nodePath = process.execPath;
  // Assuming the heartbeat entry point is at wizard/lib/heartbeat.js
  // In production, this would be the installed package path
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.voidforge.heartbeat</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${join(VOIDFORGE_DIR, 'heartbeat-entry.js')}</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${join(VOIDFORGE_DIR, 'heartbeat-launchd.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(VOIDFORGE_DIR, 'heartbeat-launchd.log')}</string>
</dict>
</plist>`;
}

function serverPlist(port: number = 3141): string {
  const nodePath = process.execPath;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.voidforge.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${join(VOIDFORGE_DIR, 'server-entry.js')}</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VOIDFORGE_PORT</key>
    <string>${port}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${join(VOIDFORGE_DIR, 'server-launchd.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(VOIDFORGE_DIR, 'server-launchd.log')}</string>
</dict>
</plist>`;
}

// ── Linux systemd ─────────────────────────────────────

function heartbeatSystemdUnit(): string {
  return `[Unit]
Description=VoidForge Heartbeat Daemon
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${join(VOIDFORGE_DIR, 'heartbeat-entry.js')}
Restart=always
RestartSec=10
StandardOutput=append:${join(VOIDFORGE_DIR, 'heartbeat-systemd.log')}
StandardError=append:${join(VOIDFORGE_DIR, 'heartbeat-systemd.log')}

[Install]
WantedBy=default.target`;
}

function serverSystemdUnit(port: number = 3141): string {
  return `[Unit]
Description=VoidForge Server (Danger Room + Cultivation)
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${join(VOIDFORGE_DIR, 'server-entry.js')}
Environment=VOIDFORGE_PORT=${port}
Restart=always
RestartSec=10
StandardOutput=append:${join(VOIDFORGE_DIR, 'server-systemd.log')}
StandardError=append:${join(VOIDFORGE_DIR, 'server-systemd.log')}

[Install]
WantedBy=default.target`;
}

// ── Install Functions ─────────────────────────────────

export async function installHeartbeatService(): Promise<{ method: string; path: string }> {
  if (platform() === 'darwin') {
    const plistDir = join(homedir(), 'Library', 'LaunchAgents');
    const plistPath = join(plistDir, 'com.voidforge.heartbeat.plist');
    await mkdir(plistDir, { recursive: true });
    await writeFile(plistPath, heartbeatPlist());
    execSync(`launchctl load "${plistPath}" 2>/dev/null || true`);
    return { method: 'launchd', path: plistPath };
  }

  if (platform() === 'linux') {
    const unitDir = join(homedir(), '.config', 'systemd', 'user');
    const unitPath = join(unitDir, 'voidforge-heartbeat.service');
    await mkdir(unitDir, { recursive: true });
    await writeFile(unitPath, heartbeatSystemdUnit());
    execSync('systemctl --user daemon-reload 2>/dev/null || true');
    execSync('systemctl --user enable voidforge-heartbeat 2>/dev/null || true');
    return { method: 'systemd', path: unitPath };
  }

  // Windows: Task Scheduler (recommend WSL2 for full support per §9.17)
  return { method: 'manual', path: 'Windows: use WSL2 or run `voidforge heartbeat start --daemon` manually' };
}

export async function installServerService(port: number = 3141): Promise<{ method: string; path: string }> {
  if (platform() === 'darwin') {
    const plistDir = join(homedir(), 'Library', 'LaunchAgents');
    const plistPath = join(plistDir, 'com.voidforge.server.plist');
    await mkdir(plistDir, { recursive: true });
    await writeFile(plistPath, serverPlist(port));
    execSync(`launchctl load "${plistPath}" 2>/dev/null || true`);
    return { method: 'launchd', path: plistPath };
  }

  if (platform() === 'linux') {
    const unitDir = join(homedir(), '.config', 'systemd', 'user');
    const unitPath = join(unitDir, 'voidforge-server.service');
    await mkdir(unitDir, { recursive: true });
    await writeFile(unitPath, serverSystemdUnit(port));
    execSync('systemctl --user daemon-reload 2>/dev/null || true');
    execSync('systemctl --user enable voidforge-server 2>/dev/null || true');
    return { method: 'systemd', path: unitPath };
  }

  return { method: 'manual', path: 'Windows: use WSL2 or run the wizard server manually' };
}

export async function uninstallServices(): Promise<void> {
  if (platform() === 'darwin') {
    const agents = ['com.voidforge.heartbeat', 'com.voidforge.server'];
    for (const label of agents) {
      const path = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
      try {
        execSync(`launchctl unload "${path}" 2>/dev/null`);
        const { unlink } = await import('node:fs/promises');
        await unlink(path);
      } catch { /* not installed */ }
    }
  }

  if (platform() === 'linux') {
    const units = ['voidforge-heartbeat', 'voidforge-server'];
    for (const unit of units) {
      try {
        execSync(`systemctl --user stop ${unit} 2>/dev/null`);
        execSync(`systemctl --user disable ${unit} 2>/dev/null`);
        const path = join(homedir(), '.config', 'systemd', 'user', `${unit}.service`);
        const { unlink } = await import('node:fs/promises');
        await unlink(path);
      } catch { /* not installed */ }
    }
    execSync('systemctl --user daemon-reload 2>/dev/null || true');
  }
}
