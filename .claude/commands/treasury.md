# /treasury — Dockson's Financial Operations

> *"Every coin has a story. I know them all."*

Read `/docs/methods/TREASURY.md` for operating rules.
Read `/docs/methods/HEARTBEAT.md` for daemon architecture.

## Prerequisites
If `wizard/` does not exist (scaffold/core users):
1. Offer: "Treasury requires the wizard server. Pull it from upstream? [Y/n]"
2. On yes: `git fetch voidforge main 2>/dev/null || git remote add voidforge https://github.com/tmcleod3/voidforge.git && git fetch voidforge main` then `git checkout voidforge/main -- wizard/` then `cd wizard && npm install`
3. On no: stop with "Run manually: `git checkout voidforge/main -- wizard/`"

## Context Setup
1. Check if financial vault exists (`~/.voidforge/treasury/vault.enc`)
2. Check if heartbeat daemon is running (`~/.voidforge/heartbeat.json`)
3. If no vault: route to setup flow
4. If vault exists but no args: show `--status`

## First-Run Experience (§9.15.1)

When no treasury vault exists:
1. "Treasury manages your project's finances — revenue tracking, ad spend budgets, and reconciliation."
2. Start guided setup: connect one revenue source first (recommend Stripe).
3. After first source connected: "Financial operations require two-factor authentication. Set up now? [Y/n]"
4. TOTP required before connecting ad platforms or enabling spend.
5. After setup: show treasury status with next steps.

## Setup Flow

`/treasury setup`:
1. "Which revenue sources?" → Stripe / Paddle / Skip for now
2. For each selected source:
   - Stripe: "Paste your restricted API key (read-only). Find it at https://dashboard.stripe.com/apikeys"
   - Paddle: "Paste your API key (read-only). Find it in your Paddle dashboard."
3. For each: encrypt → store in financial vault → connection test → initial data pull
4. Show: current balance, last 30 days revenue
5. Offer TOTP setup if not configured
6. Offer heartbeat daemon start if not running

## Commands

### Viewing
- `/treasury` or `/treasury --status` — financial summary
- `/treasury --report` — monthly report (JSON/CSV/markdown)

### Managing
- `/treasury --budget N` — set total monthly budget ($N)
- `/treasury --reconcile` — trigger manual reconciliation
- `/treasury --launch [file]` — launch campaigns from growth-campaigns.json
- `/treasury --hard-stop N` — set daily hard stop amount
- `/treasury --export [path]` — export all financial data (encrypted)

### Emergency
- `/treasury --freeze` — pause ALL automated spending immediately
- `/treasury --unfreeze` — resume (requires vault password + TOTP)
- `/treasury --setup-2fa` — configure or reconfigure TOTP

## Status Display

```
═══════════════════════════════════════════
  TREASURY — [Month Year]
═══════════════════════════════════════════
  Revenue (Stripe):        $X,XXX
  Ad Spend (all platforms): $X,XXX
  Net:                      $X,XXX
  Blended ROAS:                X.Xx
  Budget remaining:          $XXX
  Reconciliation:          ✓ MATCHED
  Heartbeat:               ● Online
═══════════════════════════════════════════
```

## Arguments
$ARGUMENTS
