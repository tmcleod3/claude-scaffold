/**
 * Desktop Notifications — macOS/Linux native notifications for daemon events.
 *
 * Uses osascript on macOS and notify-send on Linux. No dependencies.
 * Notifications are non-blocking and failure-tolerant (notification failure
 * should never crash the daemon).
 *
 * PRD Reference: §9.7 (Danger Room shows warning), v11.3 deliverables
 */

import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

type NotificationUrgency = 'low' | 'normal' | 'critical';

interface NotificationOptions {
  title: string;
  message: string;
  urgency?: NotificationUrgency;
  sound?: boolean;
}

/**
 * Send a desktop notification. Fails silently — never throws.
 */
export function notify(opts: NotificationOptions): void {
  try {
    if (platform() === 'darwin') {
      notifyMacOS(opts);
    } else if (platform() === 'linux') {
      notifyLinux(opts);
    }
    // Windows: notifications deferred — WSL2 path recommended
  } catch {
    // Notification failure is never fatal
  }
}

function notifyMacOS(opts: NotificationOptions): void {
  // SEC-005: Use execFileSync with args array to prevent shell injection
  const sound = opts.sound !== false ? ' sound name "Submarine"' : '';
  const script = `display notification "${sanitize(opts.message)}" with title "VoidForge"${sound} subtitle "${sanitize(opts.title)}"`;
  try {
    execFileSync('osascript', ['-e', script], { timeout: 5000, stdio: 'ignore' });
  } catch { /* notification failure is never fatal */ }
}

function notifyLinux(opts: NotificationOptions): void {
  // SEC-006: Use execFileSync with args array, validate urgency enum
  const validUrgencies = ['low', 'normal', 'critical'];
  const urgency = validUrgencies.includes(opts.urgency || '') ? opts.urgency! : 'normal';
  try {
    execFileSync('notify-send', ['-u', urgency, '-a', 'VoidForge', sanitize(opts.title), sanitize(opts.message)], { timeout: 5000, stdio: 'ignore' });
  } catch { /* notification failure is never fatal */ }
}

/** Strip characters that could be dangerous in shell/AppleScript contexts */
function sanitize(input: string): string {
  return input.replace(/[`$\\"\n\r\0]/g, '').slice(0, 200);
}

// ── Daemon Event Notifications ────────────────────────
// Pre-built notifications for common daemon events (§9.20.7 agent voice)

export function notifySpendSpike(platform: string, amount: string): void {
  notify({
    title: `Spend Spike — ${platform}`,
    message: `Wax reports: ${platform} spend is ${amount} above average this hour.`,
    urgency: 'critical',
    sound: true,
  });
}

export function notifyCampaignKilled(name: string, reason: string): void {
  notify({
    title: 'Campaign Paused',
    message: `Wax pulled the trigger on "${name}" — ${reason}.`,
    urgency: 'normal',
  });
}

export function notifyTokenExpiring(platform: string, hoursLeft: number): void {
  notify({
    title: `Token Expiring — ${platform}`,
    message: `Breeze warns: ${platform} token expires in ${hoursLeft} hours. Refresh needed.`,
    urgency: hoursLeft < 2 ? 'critical' : 'normal',
    sound: hoursLeft < 2,
  });
}

export function notifyReconciliationDiscrepancy(platform: string, amount: string): void {
  notify({
    title: 'Reconciliation Alert',
    message: `Dockson: Numbers don't match on ${platform} — ${amount} discrepancy.`,
    urgency: 'critical',
    sound: true,
  });
}

export function notifyVaultExpiring(hoursLeft: number): void {
  notify({
    title: 'Vault Session Expiring',
    message: `Vault session expires in ${hoursLeft} hour(s). Run \`voidforge heartbeat unlock\` to extend.`,
    urgency: 'critical',
    sound: true,
  });
}

export function notifyRevenueMilestone(amount: string): void {
  notify({
    title: 'Revenue Milestone!',
    message: `Dockson: ${amount} total revenue. Every coin has a story — this one's a good chapter.`,
    urgency: 'low',
  });
}
