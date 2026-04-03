# /cultivation — Install the Cultivation Growth Engine

> *"Cultivation is patient, strategic, and plays the longest game." — Koravellium Avast*

Read `/docs/methods/GROWTH_STRATEGIST.md` for operating rules.
Read PRD-VOIDFORGE.md §9.19 for the Cultivation architecture.

## Prerequisites
If `wizard/server.ts` does not exist (scaffold/core users):
1. Offer: "Cultivation requires the wizard server. Pull it from upstream? [Y/n]"
2. On yes: `git fetch voidforge main 2>/dev/null || git remote add voidforge https://github.com/tmcleod3/voidforge.git && git fetch voidforge main` then `git checkout voidforge/main -- wizard/` then `cd wizard && npm install`
3. On no: stop with "Run manually: `git checkout voidforge/main -- wizard/`"

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
2. Project does NOT need to be deployed — Cultivation now supports Day-0 setup (v14.0)

### Installation Steps — 7-Step Day-0 Onboarding

Growth infrastructure from the first commit, not the first customer. (Field report #131)

**Step 1 — Financial Foundation:**
- "Let's set up your growth treasury. Where will your ad spend come from?"
- Options: Mercury (API key), Brex (OAuth), existing bank account (manual), manual budget entry, **Stablecoin Treasury (USDC / approved stablecoins)**
- If Mercury/Brex: guide through API key/OAuth setup, test connection, store in financial vault
- If manual: enter monthly budget allocation ($X/month for growth)
- If **Stablecoin Treasury**:
  1. **Provider selection:** Circle (recommended) / Bridge / Manual external off-ramp
  2. **Destination bank:** Mercury (recommended) / External bank
  3. **Treasury operating mode:** Maintain buffer (recommended — keep minimum USD balance) / Just-in-time funding (off-ramp only when obligation is imminent)
  4. **Buffer threshold:** Minimum USD operating balance + minimum days of runway
  5. **Freeze thresholds:**
     - Stop off-ramp if reconciliation mismatch exceeds N bps
     - Stop platform budget increases if bank balance below threshold
     - Freeze all autonomous spend if provider connectivity fails for N consecutive cycles
  6. **TOTP verification:** Required before enabling any write operations (off-ramp, invoice settlement, unfreeze)
  - Store encrypted: provider credentials, source wallet/account IDs, destination bank mapping, approved networks and assets, funding mode and thresholds, TOTP metadata
- Create financial vault `~/.voidforge/treasury/vault.enc` (AES-256-GCM, scrypt — memory-hard, zero-dep)
- Set spending limits and circuit breakers from the start: pause if ROAS < 1.0x for 7 days, daily cap per platform
- TOTP 2FA setup: generate secret, display QR + copyable text, store in keychain

**Step 2 — Revenue Tracking:**
- "Where does your revenue come from?"
- Auto-detect: scan project for `stripe` dependency or `STRIPE_SECRET_KEY` in env/vault
- If Stripe found: "Stripe is already configured. Connect it to Treasury for revenue tracking?" → store read-only API key in vault
- If no payment processor: "Set up Stripe? Or track revenue manually?" → guide Stripe key setup or accept manual tracking
- Connect revenue source → Treasury starts tracking from day 0
- For pre-revenue projects: "No revenue yet? That's fine — Treasury will start tracking when your first payment arrives."

**Step 3 — Ad Platform Setup:** (deferred to Mission 2 — runs via `/grow --setup`)
- Flag: "Ad platforms can be configured later with `/grow --setup`. Continuing installation."

**Step 4 — Install heartbeat daemon:**
If `wizard/server.ts` exists:
- Create launchd plist (macOS) or systemd unit (Linux): `com.voidforge.heartbeat`
- Prompt for vault password to start daemon
- Daemon begins monitoring (token refresh, health checks, reconciliation)

If `wizard/server.ts` does NOT exist:
- Display: "Step 4 (Heartbeat daemon): Skipped — requires wizard server. To enable: answer Y to the wizard pull prompt at startup, or run: `git checkout origin/main -- wizard/ && npm install --prefix wizard`"

**Step 5 — Install wizard server service** (for persistent dashboard):
If `wizard/server.ts` exists:
- Create launchd plist: `com.voidforge.server`
- Wizard server runs persistently (serves Danger Room with growth tabs)

If `wizard/server.ts` does NOT exist:
- Display: "Step 5 (Wizard server): Skipped — requires wizard server."

**Step 6 — Enable growth tabs in Danger Room:**
If `wizard/server.ts` exists:
- Growth tab: shows connected treasury + revenue data from Step 1-2
- Treasury tab: shows vault status, circuit breakers, budget allocation
- Campaigns tab: empty state with guidance ("Run `/grow --setup` to configure ad platforms")
- Heartbeat tab: daemon status, last refresh timestamp

If `wizard/server.ts` does NOT exist:
- Display: "Step 6 (Danger Room tabs): Skipped — requires wizard server."

**Step 7 — Confirm success:**

If wizard is present (full install):
```
═══════════════════════════════════════════
  CULTIVATION INSTALLED — Day 0
═══════════════════════════════════════════
  Financial vault:   ✓ Created
  TOTP 2FA:          ✓ Configured
  Treasury:          ✓ Connected (Mercury | Manual: $X/mo)
  Revenue:           ✓ Connected (Stripe) | ○ Not yet
  Heartbeat daemon:  ✓ Running (PID XXXXX)
  Danger Room:       ✓ Growth tabs enabled
  Dashboard:         http://localhost:3141/danger-room#growth
═══════════════════════════════════════════
  Next steps:
    /grow --setup     Configure ad platforms
    /grow             Start your first growth campaign
═══════════════════════════════════════════
```

If wizard is NOT present (partial install):
```
═══════════════════════════════════════════
  CULTIVATION INSTALLED — Day 0 (Partial)
═══════════════════════════════════════════
  Financial vault:   ✓ Created
  TOTP 2FA:          ✓ Configured
  Treasury:          ✓ Connected (Mercury | Manual: $X/mo)
  Revenue:           ✓ Connected (Stripe) | ○ Not yet
  Heartbeat daemon:  — Skipped (requires wizard)
  Wizard server:     — Skipped (requires wizard)
  Danger Room:       — Skipped (requires wizard)
═══════════════════════════════════════════
  Steps 1-3 complete. Steps 4-6 require the wizard server.
  To enable full Cultivation:
    git checkout origin/main -- wizard/
    npm install --prefix wizard
  Then re-run /cultivation install to complete Steps 4-6.

  What works now:
    /grow             Phases 1-3 (SEO, analytics, content)
    /grow --audit-only  Full methodology audit
═══════════════════════════════════════════
```

**Step 8 — Offer Tier 3 opt-in:**
If `wizard/server.ts` exists:
- "Enable scheduled AI agents? These run weekly creative refresh and monthly strategy reviews. They consume Claude API credits. [Y/n]"
- If yes: configure `--auto-creative` and `--auto-strategy` flags

If `wizard/server.ts` does NOT exist:
- Display: "Step 8 (Scheduled AI agents): Skipped — requires heartbeat daemon."

## /cultivation status

Also available as `--status` flag for consistency.

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
