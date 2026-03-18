# /cultivation — Install the Cultivation Growth Engine

> *"Cultivation is patient, strategic, and plays the longest game." — Koravellium Avast*

Read `/docs/methods/GROWTH_STRATEGIST.md` for operating rules.
Read PRD-VOIDFORGE.md §9.19 for the Cultivation architecture.

## What Cultivation IS

Cultivation is VoidForge's autonomous growth engine — the ensemble of:
- Heartbeat daemon scheduled jobs (token refresh, spend monitoring, reconciliation, A/B evaluation)
- Growth tabs in the Danger Room dashboard (Growth Overview, Ad Campaigns, Treasury, Heartbeat)
- CLI commands (`/grow`, `/treasury`, `/portfolio`) for human-initiated strategy
- Deterministic optimization rules that run 24/7 (kill underperformers, evaluate A/B tests, rebalance budgets)

Cultivation is NOT a separate web application. The Danger Room is the single operational dashboard.

## /cultivation install

### Prerequisites
1. VoidForge must be initialized (CLAUDE.md exists, PRD exists)
2. Project should be deployed (Cultivation monitors a live product)

### Installation Steps

1. **Check prerequisites:**
   - If no PRD: "No PRD found. Run `/prd` first."
   - If not deployed: "Project not deployed. Cultivation monitors a live product. Deploy first with `/campaign` or `voidforge deploy`."

2. **Create financial vault** (if not exists):
   - Prompt for financial vault password (must differ from infra vault)
   - Create `~/.voidforge/treasury/vault.enc` (AES-256-GCM, Argon2id key derivation)
   - Separate from infrastructure vault per §9.11

3. **TOTP 2FA setup:**
   - Generate TOTP secret
   - Display QR code + copyable secret (accessible: text alternative alongside QR)
   - Store in system keychain (macOS Keychain / Linux Secret Service) per ADR-4
   - Fallback: separate encrypted file with different password
   - "Financial operations will require this code. Save it in your authenticator app."

4. **Install heartbeat daemon:**
   - Create launchd plist (macOS) or systemd unit (Linux): `com.voidforge.heartbeat`
   - Prompt for vault password to start daemon
   - Daemon begins monitoring (token refresh, health checks)

5. **Install wizard server service** (for persistent dashboard):
   - Create launchd plist: `com.voidforge.server`
   - Wizard server now runs persistently (serves Danger Room with growth tabs)

6. **Enable growth tabs in Danger Room:**
   - Growth tab added (read-only, placeholder data until `/grow` runs)
   - Financial color tokens active
   - Tab navigation system enabled

7. **Confirm success:**
   ```
   ═══════════════════════════════════════════
     CULTIVATION INSTALLED
   ═══════════════════════════════════════════
     Financial vault:   ✓ Created
     TOTP 2FA:          ✓ Configured
     Heartbeat daemon:  ✓ Running (PID XXXXX)
     Danger Room:       ✓ Growth tabs enabled
     Dashboard:         http://localhost:3141/danger-room#growth
   ═══════════════════════════════════════════
     Next: run /grow to start your first growth campaign.
   ═══════════════════════════════════════════
   ```

8. **Offer Tier 3 opt-in:**
   - "Enable scheduled AI agents? These run weekly creative refresh and monthly strategy reviews. They consume Claude API credits. [Y/n]"
   - If yes: configure `--auto-creative` and `--auto-strategy` flags

## /cultivation status

Show current Cultivation state:
- Heartbeat daemon: running/stopped/degraded
- Growth tabs: enabled/disabled
- Active campaigns: count
- Platforms connected: list
- Vault session: active/expired

## /cultivation uninstall

1. Warn about active campaigns
2. Offer to pause all campaigns
3. Export financial data
4. Remove launchd/systemd services
5. NEVER auto-delete `~/.voidforge/treasury/`

## Arguments
$ARGUMENTS
