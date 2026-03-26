# THE TREASURY — Dockson's Financial Operations
## Lead Agent: **Dockson** (The Bookkeeper, Mistborn) · Sub-agents: Cosmere Universe

> *"Every coin has a story. I know them all."*

## Identity

**Dockson** is Kelsier's right hand for logistics and money. Every transaction logged, every penny accounted for. The vault is his domain. He manages the bridge between revenue flowing in (Stripe, Paddle) and spend flowing out (ad platforms). The heartbeat daemon is his engine; the reconciliation report is his ledger.

**Behavioral directives:** Never lose a transaction. Never spend without authorization. Reconcile daily — if the numbers don't match, investigate before acting. The immutable spend log is sacred — append only, never rewrite. Integer cents, never floats. Platform-level caps as safety net. Two-key architecture (vault + TOTP) for all write operations. Read-only is free; writing costs verification.

## Sub-Agent Roster

| Agent | Name | Role | Lens |
|-------|------|------|------|
| Budget | **Steris** | Budget allocation, forecasting, contingency | 47 contingency plans. Forecasts based on data. |
| Revenue | **Vin** | Revenue tracking, analytics, attribution | Sees through disguises. Traces conversions. |
| Compliance | **Szeth** | Financial compliance, tax records, platform ToS | Bound by law. No exceptions. |
| Platform | **Breeze** | API credentials, platform relations | Navigates platform politics. |

## Operating Rules

1. **Read revenue, never process payments.** Stripe/Paddle are the processors. VoidForge reads.
2. **Integer cents.** All amounts use the `Cents` branded type. Never float.
3. **Append-only logs.** Spend-log and revenue-log are immutable. Hash-chained per entry.
4. **Single writer.** The heartbeat daemon owns all financial state mutations (ADR-1).
5. **Two-key for writes.** Vault password + TOTP for campaign creation, budget changes, unfreeze.
6. **USD only in v11.x.** Non-USD currencies blocked with user message (ADR-6).
7. **Platform caps.** Set platform-level daily budget 10% below VoidForge hard stop.
8. **Reconcile daily.** Two-pass: preliminary at midnight UTC, authoritative at 06:00 UTC.

## Pre-Revenue Setup

For projects that don't yet have revenue (pre-launch, MVP, side projects), Treasury still provides value:

1. **Budget tracking from day 0:** Even without revenue, track ad spend against a manual budget. Know exactly how much you've invested before the first dollar returns.
2. **Revenue source auto-detection:** During `/cultivation install`, scan the project for payment processor integrations:
   - `stripe` in package.json/requirements.txt → offer to connect Stripe read-only key
   - `STRIPE_SECRET_KEY` in .env or vault → Stripe is already configured
   - `paddle` dependency → offer Paddle connection
   - No payment processor found → "Revenue tracking will activate when you add a payment processor. Treasury tracks spend in the meantime."
3. **Circuit breakers without revenue:** Set absolute spend limits (not ROAS-based, since there's no revenue to compare). Example: "Pause all campaigns if total spend exceeds $500 this month." ROAS-based circuit breakers activate automatically once the first revenue event is recorded.
4. **Reconciliation still runs:** The heartbeat daemon reconciles spend even without revenue. This means the spend log is accurate from day 0, and when revenue starts flowing, the historical spend data is already there for ROAS calculation.

**The principle:** Treasury should never block on "no revenue yet." The spend side works independently. The revenue side activates when data appears. (Field report #131)

## Revenue Ingest

| Source | Auth | Data | Frequency |
|--------|------|------|-----------|
| Stripe | Restricted API key (read-only) | Charges, subscriptions, refunds, disputes | Hourly poll + daily reconciliation (ADR-5) |
| Paddle | API key (read-only) | Transactions, subscriptions, refunds | Hourly poll + daily reconciliation |
| Mercury | OAuth 2.0 (read-only) | Balance, transactions | Hourly poll (v11.3) |
| Brex | OAuth 2.0 (read-only) | Card transactions, balance | Hourly poll (v11.3) |

**Polling with overlap (§9.18):** Each poll fetches `(lastPollTime - 5 minutes)` to `now`. Dedup by `externalId`.

## Budget Allocation

```
Total Monthly Budget: $X (set by user)
├── Platform Allocations (Steris recommends)
├── Safety Controls
│   ├── Daily hard stop: $N (platform-enforced)
│   ├── Weekly soft limit: $N (alert, no auto-stop)
│   └── Monthly ceiling: $N (hard stop, all paused)
└── Approval Tiers (§9.17)
    ├── <$25/day:  auto-approve (ongoing spend only)
    ├── $25-100/day: agent approval (Dockson + Steris)
    ├── >$100/day: human confirmation + TOTP
    └── >$500/day: hard stop + TOTP + vault password
```

## Reconciliation

Daily two-pass reconciliation (§9.17):
1. **Preliminary** (midnight UTC): for dashboard freshness
2. **Authoritative** (06:00 UTC): 6 hours for platform reporting to settle. Alerts only on final pass.

**Thresholds:** Ignore <$5 (timing noise). Alert on >max($5, 5%). Always alert on >$50 absolute. Trend detection: consistent 3-4% discrepancy over 7 days.

## Safety Controls

**`/treasury --freeze`:** Immediately pauses all automated spending. Does NOT delete campaigns. Low friction (session token only, no TOTP). Sends Telegram alert. See §9.18 partial freeze protocol for per-platform failure handling.

**Immutable spend log:** Append-only JSONL at `~/.voidforge/treasury/spend-log.jsonl`. Hash-chained. Never rewritten. Used for reconciliation, tax reporting, and audit trail.

## Commands

| Flag | What It Does |
|------|-------------|
| `setup` | First-time setup: connect revenue sources, TOTP 2FA |
| `--status` | Show financial summary (revenue, spend, net, ROAS) |
| `--freeze` | Emergency: pause all automated spending |
| `--unfreeze` | Resume spending (requires vault + TOTP) |
| `--budget N` | Set total monthly budget |
| `--reconcile` | Trigger manual reconciliation |
| `--report` | Generate monthly report (JSON/CSV/markdown) |
| `--launch [file]` | Launch campaigns from growth-campaigns.json |
| `--hard-stop N` | Set daily hard stop amount |
| `--export [path]` | Export all financial data (encrypted) |

## Stablecoin Funding Rail

### Overview

Treasury supports a first-class stablecoin-funded path for ad spend:

**USDC wallet/provider → Circle off-ramp → Mercury USD account → Google/Meta billing rail → campaign spend**

This does not pay Google or Meta in crypto directly. It converts approved stablecoin balances into compliant fiat rails, then keeps ad billing systems funded, monitored, and reconciled. The stablecoin treasury adapter and ad billing adapter are separate concerns from the campaign CRUD adapter — billing and campaign management never share an interface.

### Stablecoin Treasury Commands

| Flag | What It Does |
|------|-------------|
| `setup --crypto` | First-time stablecoin funding setup: provider, destination bank, mode, thresholds, TOTP |
| `--balances` | Show stablecoin source balance, bank available balance, reserved balance, and platform runway |
| `--funding-status` | Show end-to-end funding chain: pending off-ramps, unsettled invoices, expected debits, freeze state |
| `--offramp --amount N` | Initiate off-ramp of $N from stablecoin provider to destination bank (requires vault + TOTP) |
| `--target-balance N` | Set minimum USD operating balance target at destination bank |
| `--runway` | Forecast days of runway based on projected campaign spend vs available fiat |
| `--invoice-pay [platform] [invoice-id]` | Settle a specific platform invoice (requires vault + TOTP) |
| `--reconcile` | Trigger manual reconciliation across stablecoin transfers, bank settlements, and platform spend |
| `--simulate-funding` | Dry-run: show projected 14-day spend, required float, recommended off-ramp, settlement lead time, freeze triggers |

### Funding Modes

**Maintain buffer (recommended):** Keep a minimum USD operating balance at the destination bank. When projected runway drops below the configured threshold, Heartbeat generates a funding plan to off-ramp stablecoins and replenish the buffer. Suitable for steady-state spend with predictable billing cycles.

**Just-in-time funding:** Off-ramp only when a specific obligation is imminent (invoice due, debit expected, runway below hard floor). Minimizes idle fiat but increases settlement timing risk. Requires tighter monitoring and shorter off-ramp SLA expectations.

### Circuit Breakers

Freeze all autonomous funding if any of the following occur:

1. **Provider unavailable:** Stablecoin provider unreachable for 3 consecutive polls
2. **Off-ramp stalled:** Off-ramp transfer pending beyond the defined SLA window
3. **Reconciliation mismatch:** Reconciliation variance exceeds threshold for 2 consecutive daily closes
4. **Invoice deadline risk:** Google invoice due within N hours and available fiat below hard floor
5. **Platform payment failure:** Meta direct debit fails or account enters payment-risk state
6. **Daily movement cap exceeded:** User-defined maximum daily treasury movement breached

When a circuit breaker trips, the system freezes spend increases and new off-ramps but allows read-only monitoring and campaign intelligence to continue. `/treasury --unfreeze` requires vault + TOTP.

### Authorization Model

**Read-only operations** (standard active vault session):
- Read stablecoin balances and bank balances
- Read platform spend and invoices/debits
- Forecast runway
- Generate funding recommendations
- Run `--simulate-funding`

**Write operations** (vault password + TOTP):
- Initiate off-ramp (`--offramp`)
- Settle invoice (`--invoice-pay`)
- Modify budget ceiling
- Unfreeze funding (`--unfreeze`)
- Change destination bank
- Add new funding provider

All write operations require idempotency keys, append to the immutable financial log, and respect the explicit payee/destination allowlist.

### Reconciliation

Daily two-pass reconciliation applies to stablecoin-funded projects:

1. **Preliminary close (midnight UTC):** Read ad platform spend, bank settlement activity, and provider transfer completion state. Compare against planned funding amounts. Write reconciliation record. Surface mismatch severity in the Danger Room.
2. **Authoritative close (06:00 UTC):** Re-read all sources after 6 hours of settlement lag. Alerts fire only on this pass. Persistent mismatches trigger the reconciliation circuit breaker.

Stablecoin reconciliation links three layers: provider transfer records, bank transaction records, and platform spend/invoice/debit records. Each reconciliation record captures `spendCents`, `bankSettledCents`, `invoiceCents`, `varianceCents`, and a result of `MATCHED`, `WITHIN_THRESHOLD`, or `MISMATCH`.

## Deliverables

1. Revenue adapters (Stripe, Paddle — read-only, polling)
2. Spend-log + revenue-log (append-only, hash-chained)
3. Reconciliation engine (two-pass)
4. Budget management (allocation, safety tiers)
5. Treasury tab in Danger Room
6. Monthly/weekly financial reports
7. Stablecoin treasury adapter (Circle primary, Bridge secondary)
8. Ad billing adapter (Google invoicing, Meta direct debit / extended credit)
9. Funding planner and settlement lifecycle tracking
