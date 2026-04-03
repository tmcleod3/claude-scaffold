# THE HEARTBEAT — Daemon Architecture & Operations
## Lead Agent: **Dockson** (The Bookkeeper) · Operations: Heartbeat Daemon

> *"The daemon watches while you sleep."*

## Identity

The heartbeat is a lightweight Node.js daemon that runs in the background, separate from the wizard server. It is the **single writer** for all financial state (ADR-1). The CLI and Danger Room are clients; the daemon is the authority.

## Architecture

```
┌─────────────────────────────────────────┐
│         Heartbeat Daemon Process         │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ Unix Domain Socket API              │ │
│  │ ~/.voidforge/run/heartbeat.sock     │ │
│  │ Auth: session token (heartbeat.token)│ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ Scheduled Jobs:                     │ │
│  │   Health ping (60s)                 │ │
│  │   Token refresh (per-platform TTL)  │ │
│  │   Spend check (hourly)              │ │
│  │   Campaign status (15 min)          │ │
│  │   Anomaly detection (hourly)        │ │
│  │   Reconciliation (midnight + 06:00) │ │
│  │   A/B test evaluation (daily)       │ │
│  │   Budget rebalancing (weekly)       │ │
│  │   Growth report (weekly)            │ │
│  │   Campaign kill check (daily)       │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  State: heartbeat.json (60s writes)      │
│  Logs:  heartbeat.log (daily rotation)   │
│  PID:   heartbeat.pid                    │
│  Token: heartbeat.token (24h rotation)   │
└─────────────────────────────────────────┘
```

## Startup Sequence (§9.18)

1. Check PID file → if stale, unlink
2. Check socket file → if stale (ECONNREFUSED), unlink
3. Read heartbeat.json → if dirty shutdown, write `recovering` status
4. Prompt for vault password → derive key, hold in memory
5. Scan pending-ops.jsonl → reconcile stuck operations
6. Verify token health for all platforms
7. Check for missed reconciliation days → queue backfill
8. Write PID file, create socket, start scheduler
9. Transition to `healthy` or `degraded`
10. Write heartbeat.json

## Signal Handling

- **SIGTERM:** Set shutdown flag → complete in-flight requests (10s) → write final heartbeat.json → flush logs → remove PID file → exit 0
- **SIGINT:** Same as SIGTERM
- **SIGHUP:** Reload configuration without restart

## Sleep/Wake Recovery (§9.18)

| Duration | Token Refresh | Spend Check | Reconciliation |
|----------|--------------|-------------|----------------|
| <2h | Stagger 5 min | Current check | Skip |
| 2-24h | Sequential, 10s gaps | Full missed period | Most recent day |
| >24h | Sequential, 30s gaps | Current day only | Backfill queue |

## Socket API (§9.20.11)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /status | Token | Heartbeat status |
| GET | /campaigns | Token | All campaigns |
| GET | /treasury | Token | Financial summary |
| POST | /campaigns/launch | Token + vault | Launch campaigns |
| POST | /campaigns/:id/pause | Token | Pause campaign |
| POST | /campaigns/:id/resume | Token + vault | Resume campaign |
| POST | /budget | Token + vault | Modify budget |
| POST | /freeze | Token | Emergency freeze |
| POST | /unfreeze | Token + vault + TOTP | Unfreeze |
| POST | /reconcile | Token | Manual reconciliation |
| POST | /unlock | Vault password | Re-enter vault after timeout |

## Vault Session (§9.18)

- Vault key held in process memory after password entry
- `--vault-timeout N` (default: 12h, vacation mode: 168h)
- On timeout: daemon enters `degraded` — can write heartbeat.json but cannot refresh tokens
- On SIGTERM: zero key memory before exit
- Core dumps disabled: `setrlimit RLIMIT_CORE 0`

## Service Management

**macOS:** `~/Library/LaunchAgents/com.voidforge.heartbeat.plist`
- KeepAlive: true, RunAtLoad: true, ProcessType: Background

**Linux:** `~/.config/systemd/user/voidforge-heartbeat.service`
- Restart: always, RestartSec: 10

## Resource Footprint

- Memory: <50MB
- CPU: near-zero (sleeping between jobs)
- Network: ~100 API calls/hour at peak
- Disk: heartbeat.json (<1KB), heartbeat.log (<10MB, rotated daily)

## Daemon States

`starting` → `healthy` / `degraded` / `recovering` / `recovery_failed` → `shutting_down` → `stopped`

`degraded`: N of M platforms unreachable, or vault key expired.
`recovering`: dirty shutdown detected, reconciling pending ops.
`recovery_failed`: 3 consecutive recovery attempts failed.

### Funding Sub-States

When stablecoin treasury is configured, the daemon tracks additional funding sub-states in `heartbeat.json`:

- `fundingHealthy`: All funding sources reachable, bank balance above threshold, no pending issues
- `fundingDegraded`: Provider intermittently unreachable, or bank balance approaching minimum buffer, or settlement lag detected
- `fundingFrozen`: A circuit breaker has tripped — all autonomous funding halted, read-only monitoring continues
- `awaitingApproval`: A funding plan has been generated but requires manual approval (first live off-ramp, first invoice settlement, or policy-gated action)
- `settlementPending`: An off-ramp or invoice payment has been initiated and is waiting for bank settlement confirmation

These sub-states are independent of the main daemon state. The daemon can be `healthy` with `fundingFrozen` (platform monitoring works, but treasury writes are halted).

## Stablecoin Funding Jobs

When stablecoin treasury is configured, Heartbeat adds these scheduled jobs:

| Job | Schedule | What It Does |
|-----|----------|-------------|
| Stablecoin balance check | Hourly | Poll the stablecoin provider for current wallet balance. Update `heartbeat.json` funding state. Alert if balance drops below configured threshold. |
| Off-ramp status poll | Every 15 min (while pending) | Check provider API for transfer completion. Transition funding plan from `PENDING_SETTLEMENT` to `SETTLED` or `FAILED`. Activate only when a transfer is in flight. |
| Bank settlement monitor | Hourly | Poll Mercury (or destination bank) for new transactions. Match incoming settlements to pending funding plans by amount and reference. |
| Google invoice scan | Daily | Read Google Ads billing state. Detect upcoming invoice due dates. Generate funding plan if invoice amount exceeds available fiat minus reserve. |
| Meta debit monitor | Daily | Read Meta Ads billing state. Detect expected direct debits or invoice settlements. Generate funding plan if projected debit would breach bank floor. |
| Runway forecast | Every 6h | Calculate days of runway from current bank balance, projected platform spend rate, and pending off-ramp settlements. Update Danger Room risk level. |
| Reconciliation close | Midnight + 06:00 UTC | Two-pass daily close. Read platform spend, bank settlements, and provider transfers. Write reconciliation record. Fire alerts only on the 06:00 authoritative pass. |
| Stale funding plan detector | Hourly | Scan `pending-ops.jsonl` for funding plans stuck in `DRAFT` or `APPROVED` beyond SLA. Escalate stale plans to `fundingDegraded` state. |

### Kongo Landing Page Jobs (ADR-036)

When Kongo is connected (API key in financial vault), Heartbeat registers these additional jobs:

| Job | Schedule | What It Does |
|-----|----------|-------------|
| `kongo-signal` | Hourly | Poll growth signal for all published Kongo campaigns. Compute winner confidence from analytics data (two-proportion z-test). Log signal to heartbeat state. Flag `scale`/`kill` recommendations for daemon action. |
| `kongo-seed` | On A/B winner | Triggered when Wayne declares a page variant winner (or when analytics cross 95% confidence). Extract winning variant's slot values. Available as seed for next page generation cycle. |
| `kongo-webhook` | Event-driven | Receive Kongo webhook events (`page.completed`, `page.failed`) on daemon's HTTP callback port. Verify HMAC-SHA256 signature with timing-safe comparison. Route to appropriate handler. |

**Conditional registration:** Jobs are only registered when `kongo-api-key` exists in the financial vault. On daemon startup, check vault before registering. If Kongo is disconnected later, jobs skip silently.

**Implementation:** `wizard/lib/kongo/jobs.ts` — `createKongoJobs()` returns handlers, `registerKongoJobs()` wires to scheduler.

### Funding Planner Integration

Heartbeat uses the treasury planner to generate and execute funding plans:

1. **Forecast:** The runway forecast job calculates required fiat based on projected campaign spend across all connected platforms.
2. **Plan generation:** When runway drops below the configured threshold (maintain-buffer mode) or a specific obligation is imminent (just-in-time mode), Heartbeat generates a `FundingPlan` record with reason, source, destination, required amount, and approval mode.
3. **Approval routing:** Plans below the auto-approve threshold execute via policy. Plans above the threshold, or first-time actions (first live off-ramp, first invoice settlement), enter `awaitingApproval` and notify the user via Telegram/Danger Room.
4. **Execution:** Approved plans trigger the stablecoin provider off-ramp API. The off-ramp status poll tracks completion. On settlement, the bank settlement monitor confirms arrival.
5. **Reconciliation:** The daily close links the original funding plan to the provider transfer record, the bank transaction record, and the platform spend/invoice/debit record.

All funding plan mutations go through Heartbeat as the single writer. The CLI and Danger Room read funding state but never mutate it directly.
