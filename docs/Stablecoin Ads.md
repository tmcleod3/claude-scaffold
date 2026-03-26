# Cultivation Stablecoin Ad Funding Rail — Feature PRD

## Frontmatter
```yaml
name: "Cultivation Stablecoin Ad Funding Rail"
type: "full-stack"
framework: "node.js / typescript"
database: "none"
cache: "none"
styling: "tailwind"
auth: yes
payments: none
workers: yes
admin: yes
marketing: yes
email: none
deploy: "vps"
ai: no
```

## 1. Executive Summary

Add a first-class **stablecoin-funded treasury rail** to VoidForge Cultivation so a project can move from **USDC (or other approved stablecoins)** to **Google Ads and Meta Ads spend** through compliant fiat rails, with deterministic monitoring and daily reconciliation.

This feature does **not** attempt to pay Google or Meta in stablecoins directly. Instead, it extends Cultivation's existing split of responsibilities:

- **/cultivation** installs the growth operating system and treasury foundation
- **/grow** configures ad platforms and campaign operations
- **/treasury** manages funding rails, budgets, settlements, and reconciliation
- **Heartbeat** becomes the single writer and settlement authority for off-ramp, bank, and invoice state
- **Danger Room** remains the one operational dashboard

The core product move is to add two new abstractions that fit the existing architecture instead of breaking it:

1. **Stablecoin Treasury Adapter** — turns crypto balances into settled fiat at a linked operating bank
2. **Ad Billing Adapter** — models how each ad platform actually gets funded once fiat exists

This lets Cultivation support a real-world path that works today:

**Stablecoin wallet/provider → off-ramp/redemption → USD bank balance → Google/Meta billing rail → campaign spend**

## 2. Problem Statement

Cultivation can already reason about growth strategy, campaign creation, and treasury controls, but it assumes ad spend starts as fiat. For operators who hold working capital in stablecoins, there is no native path inside VoidForge to:

- connect a stablecoin source of funds
- automate off-ramp into a bank account
- monitor whether platform billing rails are healthy
- keep Google or Meta spend funded without manual treasury work
- reconcile crypto source funds, fiat settlement, and platform spend as one ledger

Today, this forces the user into a brittle external workflow:

1. manually redeem stablecoins to fiat
2. wait for bank settlement
3. manually top up or pay invoices
4. separately launch and monitor campaigns
5. manually reconcile spend against wallet movements and bank debits

That breaks the Cultivation promise of a single growth operating system.

## 3. Product Goal

Enable a user to configure a compliant, observable, and mostly automated path from approved stablecoin balances to ad spend availability for Google Ads and Meta Ads inside the existing Cultivation stack.

### Primary outcome
A user with a stablecoin treasury can keep supported ad accounts funded and reconciled from inside VoidForge using existing Cultivation and Treasury workflows.

### Success definition
A user can:

- connect a stablecoin funding provider
- connect a destination bank account
- verify which billing rails are actually available for each ad platform
- define minimum bank buffers and platform-specific spend caps
- trigger or schedule off-ramp actions
- see end-to-end status in the Danger Room
- reconcile stablecoin movements, bank settlements, invoices/debits, and platform spend daily

## 4. Non-Goals

This feature will **not**:

- attempt to force unsupported direct crypto payments into Google Ads or Meta Ads
- bypass platform KYC, credit approval, billing verification, or business eligibility requirements
- act as a new money transmitter or custody layer outside approved providers
- support anonymous wallets or unverified payout destinations
- auto-enable write access without Vault + TOTP verification
- manage credit card-based ad funding in V1 except as an explicitly unsupported informational state
- create a separate “Cultivation app” outside the existing Danger Room / Heartbeat / CLI model

## 5. Guiding Product Principles

1. **Reality over fantasy.** Model the billing rails Google and Meta actually support, not an imagined “pay with USDC” future.
2. **Treasury is separate from campaign APIs.** Campaign CRUD and billing/funding are different concerns and must remain separate interfaces.
3. **Single writer.** Heartbeat remains the only process that mutates financial state.
4. **Write operations are expensive.** Stablecoin redemption, wires, invoice payment, and budget changes require stronger authorization than read/reporting.
5. **Deterministic first.** The system begins with rules, thresholds, and reconciliation before any autonomous optimization.
6. **One dashboard.** The Danger Room stays the operational surface; no bolt-on admin panel.
7. **Graceful degradation.** If a provider breaks or a platform billing rail is unavailable, campaign intelligence can continue while spend execution freezes.

## 6. User Personas

### Persona A — Crypto-native operator
Keeps treasury in USDC, wants to run performance marketing without manually converting funds or moving cash around every few days.

### Persona B — Growth lead with finance ownership
Needs campaign spend to keep running, but also needs auditability, approvals, and end-of-day reconciliation.

### Persona C — Multi-project operator
Runs several brands or projects and wants portfolio-level rebalancing across stablecoin holdings, bank float, and platform budgets.

## 7. User Stories

### Setup
- As a user, I can choose **Stablecoin Treasury** during `/cultivation install`.
- As a user, I can connect an off-ramp provider (Circle first, Bridge second, other adapters later).
- As a user, I can connect Mercury as my destination operating account.
- As a user, I can choose whether the system should maintain a fiat cash buffer or operate just-in-time.

### Platform onboarding
- As a user, I can run `/grow --setup` and see whether Google and Meta are **fully fundable**, **campaign-only**, or **unsupported** based on billing configuration.
- As a user, I can store platform account IDs, billing setup IDs, invoice group IDs, and payout references securely.

### Operations
- As a user, I can ask Treasury to top up my operating float when projected runway falls below a threshold.
- As a user, I can approve or schedule invoice settlement or bank funding events.
- As a user, I can pause all automated funding immediately.

### Monitoring
- As a user, I can see wallet balance, off-ramp status, bank balance, unsettled invoices, and platform runway in one place.
- As a user, I can see the exact chain from stablecoin source funds to ad spend availability.

### Auditability
- As a user, I can export immutable financial logs showing every redemption, settlement, debit, invoice, and reconciliation event.

## 8. Product Scope

## In Scope for V1

### Treasury source of funds
- Approved stablecoin treasury source
- Provider abstraction with at least:
  - Circle adapter
  - Bridge adapter placeholder or limited adapter
- Fiat operating account destination:
  - Mercury first-class support
  - generic external bank as informational/manual fallback

### Ad platforms
- Google Ads funding support via:
  - monthly invoicing path
  - informational fallback state for bank-transfer/manual-only configurations
- Meta Ads funding support via:
  - direct debit state tracking
  - extended credit / monthly invoicing state tracking

### Internal surfaces
- `/cultivation install` enhancements
- `/grow --setup` billing capability checks
- `/treasury` crypto funding commands and reconciliation commands
- Heartbeat scheduled jobs and funding planner
- Danger Room treasury/growth/heartbeat updates
- Immutable logs and reporting

## Out of Scope for V1

- TikTok/LinkedIn/Twitter/Reddit billing rails
- direct stablecoin card programs as default path
- dynamic foreign exchange support beyond USD-centered flows
- non-USD ad account funding
- self-hosted custody or exchange routing engine
- direct invoice retrieval from every platform when no official API or export path exists

## 9. Product Decision: Supported Funding Paths

V1 should be opinionated.

### Default recommended path
**USDC treasury → Circle off-ramp → Mercury USD account → Google monthly invoicing and/or Meta direct debit / extended credit**

### Why this is the default
- cleanest compliance posture
- most deterministic settlement chain
- bank account remains the shared fiat anchor for both platforms
- aligns with existing Mercury-first Treasury flow
- fits existing “interactive setup + daemon runtime” pattern

### Secondary path
**USDC treasury → Bridge orchestration → Mercury or external bank → platform billing rail**

Bridge is architecturally valuable but should be treated as a secondary adapter in V1 because the first implementation should optimize for the clearest bank-withdraw workflow and operational simplicity.

### Explicitly not the default
Stablecoin-backed card funding is a future or experimental path. It should not be the core architecture because it is less durable, less uniform across platforms, and more vulnerable to payment-method policy shifts.

## 10. Product Requirements

## 10.1 `/cultivation install` enhancements

Add a new funding source branch under Step 1 — Financial Foundation.

### New prompt flow

**Where will your growth spend come from?**
- Mercury (fiat)
- Brex (fiat)
- Existing bank account (manual)
- Manual budget entry
- **Stablecoin Treasury (USDC / approved stablecoins)**

If **Stablecoin Treasury** is selected:

1. Ask provider:
   - Circle
   - Bridge
   - Manual / external off-ramp
2. Ask destination bank:
   - Mercury
   - External bank
3. Ask treasury operating mode:
   - Maintain buffer (recommended)
   - Just-in-time funding
4. Ask buffer threshold:
   - min USD operating balance
   - min days of runway
5. Ask freeze thresholds:
   - stop off-ramp if reconciliation mismatch > N bps
   - stop platform budget increases if bank balance < threshold
   - freeze all autonomous spend if provider connectivity fails > N cycles
6. Require TOTP before enabling write operations

### New vault entries
Store encrypted:
- stablecoin provider credentials
- allowed source wallet IDs / account IDs
- destination bank mapping
- approved networks and assets
- funding mode and thresholds
- TOTP metadata
- platform billing metadata collected later

## 10.2 `/grow --setup` enhancements

Ad platform onboarding must now include **billing capability verification**, not just campaign API authentication.

### Google checks
- Ads API access works
- account has usable billing configuration
- monthly invoicing enabled or not
- payments account / billing setup identifiers captured
- if monthly invoicing unavailable, platform is marked:
  - **campaign ops only**
  - not eligible for fully programmatic funding

### Meta checks
- Marketing API auth works
- account is associated with direct debit or extended credit / invoice path, if available
- ad account funding mode classified as:
  - **bank-backed autopay**
  - **invoice / extended credit**
  - **campaign ops only**

### Onboarding result
Each platform receives one of three capability states:

- **FULLY_FUNDABLE** — Cultivation can manage treasury readiness and settlement lifecycle
- **MONITORED_ONLY** — campaigns and spend can be monitored, but billing rail is not sufficiently automatable
- **UNSUPPORTED** — platform billing configuration blocks automation

## 10.3 `/treasury` enhancements

Add stablecoin-aware operations.

### New commands
- `/treasury setup --crypto`
- `/treasury --balances`
- `/treasury --funding-status`
- `/treasury --offramp --amount N`
- `/treasury --target-balance N`
- `/treasury --runway`
- `/treasury --invoice-pay [platform] [invoice-id]`
- `/treasury --reconcile`
- `/treasury --freeze`
- `/treasury --unfreeze`
- `/treasury --simulate-funding`

### Behavior
- reads provider balances
- calculates required fiat runway from projected campaign spend
- recommends or executes off-ramp actions
- generates funding plan records
- tracks pending settlement states
- reconciles spend versus bank debits / invoice settlements

## 10.4 Heartbeat daemon enhancements

Heartbeat becomes responsible for treasury automation scheduling.

### New scheduled jobs
- stablecoin balance check (hourly)
- off-ramp status poll (every 15 min while pending)
- bank settlement monitor (hourly)
- Google invoice scan / due-date monitor (daily)
- Meta debit / invoice settlement monitor (daily)
- platform runway forecast (every 6h)
- reconciliation close (midnight + 06:00)
- stale funding plan detector (hourly)

### New daemon states
Add sub-status to `heartbeat.json`:
- `fundingHealthy`
- `fundingDegraded`
- `fundingFrozen`
- `awaitingApproval`
- `settlementPending`

## 10.5 Danger Room updates

No new product surface. Extend existing tabs.

### Growth Overview
Show:
- active platforms
- spend today / 7d / 30d
- runway days
- funding risk level
- next required treasury event

### Treasury tab
Show:
- stablecoin source balance
- pending off-ramp transfers
- Mercury USD available balance
- reserved balance
- unsettled invoices / expected debits
- reconciliation status
- freeze state and reason

### Campaigns tab
Show:
- campaign status
- spend vs budget
- billing rail capability per platform
- warning if campaign is healthy but billing rail is degraded

### Heartbeat tab
Show:
- last provider sync
- last successful off-ramp
- pending operations count
- last reconciliation time
- daemon authority note: “Heartbeat is the single financial writer.”

## 11. System Architecture

## 11.1 New architectural abstractions

### A. Stablecoin Treasury Adapter
Purpose: abstract the funding source and off-ramp lifecycle.

#### Interactive setup interface
Runs in CLI / Danger Room.

Responsibilities:
- authenticate provider
- verify supported assets/networks
- verify linked bank destination
- fetch initial balances
- run test transfer or sandbox verification when possible

#### Runtime interface
Runs in Heartbeat.

Responsibilities:
- get balances
- quote/redemption estimate
- create off-ramp instruction
- get transfer status
- cancel if provider supports cancellation
- list completed transfers for reconciliation

### B. Ad Billing Adapter
Purpose: separate campaign API operations from funding mechanics.

Responsibilities:
- verify billing capability
- read billing configuration status
- read invoices / expected debits when available
- generate settlement instructions
- confirm settlement / debit detection
- normalize platform funding state

This adapter **must not** live inside the campaign CRUD adapter. Billing and ad management are separate concerns.

## 11.2 Funding flow model

### Google path
1. Stablecoin provider balance exists
2. Treasury forecasts required fiat runway
3. Heartbeat initiates off-ramp to Mercury if buffer is insufficient
4. Google account already has monthly invoicing / approved billing setup
5. Treasury tracks invoice due state and expected payment instructions
6. Mercury executes required wire/bank settlement when approved by policy
7. Heartbeat reconciles invoice, bank transaction, and spend

### Meta path
1. Stablecoin provider balance exists
2. Treasury forecasts required bank balance for upcoming direct debit or invoice payment
3. Heartbeat initiates off-ramp to Mercury if balance threshold will be breached
4. Meta debits the linked bank account or invoices the business under extended credit
5. Heartbeat detects debit/invoice settlement and reconciles to spend

## 11.3 File and service architecture

### New or updated files

```text
.claude/commands/
  cultivation.md          # update setup flow for Stablecoin Treasury
  grow.md                 # update platform onboarding with billing capability checks
  treasury.md             # update crypto treasury operations

docs/methods/
  TREASURY.md             # extend for stablecoin funding rules
  HEARTBEAT.md            # add new jobs/states
  GROWTH_STRATEGIST.md    # add billing capability awareness

docs/patterns/
  stablecoin-adapter.ts   # new
  ad-billing-adapter.ts   # new
  funding-plan.ts         # new

wizard/lib/financial/
  stablecoin/
    base.ts
    circle.ts
    bridge.ts
  billing/
    base.ts
    google-billing.ts
    meta-billing.ts
  treasury-planner.ts
  reconciliation-engine.ts
  funding-policy.ts

wizard/api/
  treasury/
    balances.ts
    funding-status.ts
    freeze.ts
    unfreeze.ts
    simulate.ts

logs/
  funding-state.md
  funding-plans.jsonl
  transfers.jsonl
  reconciliation.jsonl
```

### Persistent state under `~/.voidforge/treasury/`

```text
vault.enc
funding-config.json.enc
funding-plans.jsonl
transfers.jsonl
reconciliation.jsonl
billing-platforms.json.enc
pending-ops.jsonl
```

## 12. Data Model

All monetary values use branded integer cents.

## 12.1 StablecoinFundingSource
- id
- provider (`circle` | `bridge` | `manual`)
- asset (`USDC` initially)
- network
- sourceAccountId
- whitelistedDestinationBankId
- status

## 12.2 OperatingBankAccount
- id
- provider (`mercury` | `external`)
- accountId
- currency (`USD` only in V1)
- availableBalanceCents
- reservedBalanceCents
- minimumBufferCents

## 12.3 PlatformBillingProfile
- platform (`google` | `meta`)
- capabilityState (`FULLY_FUNDABLE` | `MONITORED_ONLY` | `UNSUPPORTED`)
- billingMode (`monthly_invoicing` | `direct_debit` | `extended_credit` | `manual_bank_transfer` | `unknown`)
- externalAccountId
- billingSetupId / invoiceGroupId / paymentProfileId
- currency
- nextDueDate
- status

## 12.4 FundingPlan
- id
- createdAt
- reason (`LOW_BUFFER` | `INVOICE_DUE` | `RUNWAY_SHORTFALL` | `MANUAL_REQUEST`)
- sourceFundingId
- destinationBankId
- targetPlatform (`google` | `meta` | `shared_buffer`)
- requiredCents
- reservedCents
- status (`DRAFT` | `APPROVED` | `PENDING_SETTLEMENT` | `SETTLED` | `FAILED` | `FROZEN`)
- approvalMode (`policy_auto` | `vault_manual` | `totp_required`)

## 12.5 TransferRecord
- id
- fundingPlanId
- providerTransferId
- bankTransactionId
- direction (`crypto_to_fiat` | `bank_to_platform` | `platform_debit`)
- amountCents
- feesCents
- reference
- status
- previousHash
- hash

## 12.6 ReconciliationRecord
- id
- platform
- date
- spendCents
- bankSettledCents
- invoiceCents
- varianceCents
- result (`MATCHED` | `WITHIN_THRESHOLD` | `MISMATCH`)
- notes

## 13. Authorization and Safety Model

## 13.1 Read vs write boundaries

### Read-only operations
Allowed with standard active vault session:
- read balances
- read spend
- read invoices/debits
- forecast runway
- generate funding recommendation

### Write operations
Require stronger authorization:
- initiate off-ramp
- settle invoice
- modify budget ceiling
- unfreeze funding
- change destination bank
- add new funding provider

### Required controls
- Vault password
- TOTP for high-risk actions
- idempotency keys for all write operations
- append-only financial logs
- explicit payee / destination allowlist

## 13.2 Circuit breakers

Freeze all autonomous funding if any of the following occur:
- stablecoin provider unavailable for 3 consecutive polls
- off-ramp pending beyond defined SLA window
- reconciliation mismatch exceeds threshold for 2 consecutive closes
- Google invoice due within N hours and available fiat below hard floor
- Meta direct debit fails or account enters payment-risk state
- user-defined max daily treasury movement exceeded

## 13.3 Manual approval gates

Mandatory human approval in V1 for:
- first live off-ramp per provider
- first Google invoice settlement
- first platform activation into FULLY_FUNDABLE state
- any transfer to a newly created destination profile

## 14. Product UX and CLI Behavior

## 14.1 Cultivation install result

At the end of install, show a stablecoin-aware success state:

```text
═══════════════════════════════════════════
CULTIVATION INSTALLED — STABLECOIN READY
═══════════════════════════════════════════
Funding source:       ✓ Circle (USDC)
Destination bank:     ✓ Mercury Checking
Treasury mode:        ✓ Maintain buffer ($25,000 min)
TOTP 2FA:             ✓ Configured
Heartbeat daemon:     ✓ Running
Danger Room:          ✓ Growth + Treasury tabs enabled
Platforms connected:  ○ Not yet
═══════════════════════════════════════════
Next steps:
/grow --setup         Connect Google / Meta
/treasury --simulate-funding
/treasury --balances
═══════════════════════════════════════════
```

## 14.2 Platform setup summary

After `/grow --setup`:

```text
═══════════════════════════════════════════
AD PLATFORM BILLING CAPABILITIES
═══════════════════════════════════════════
Google Ads:  FULLY_FUNDABLE
  Billing mode: monthly invoicing
  Treasury action: invoice settlement supported

Meta Ads:    MONITORED_ONLY
  Billing mode: card / unknown
  Treasury action: spend monitored, funding not automated
═══════════════════════════════════════════
```

## 14.3 Treasury simulation

Before first live run, `/treasury --simulate-funding` should show:
- projected 14-day spend
- required operating float
- recommended off-ramp amount
- settlement lead time assumption
- what would trigger a freeze

## 15. Rules Engine

Cultivation must start with deterministic funding rules.

### Rule set V1
- Maintain minimum operating buffer
- Never off-ramp more than max daily treasury movement
- Never raise platform budget if bank balance after reserve would fall below floor
- If Google invoice due date is within threshold, prioritize invoice coverage over new campaign expansion
- If Meta uses direct debit, maintain debit protection buffer above forecasted 7-day spend
- If discrepancy exists, freeze spend increases but allow read-only monitoring
- If platform capability is `MONITORED_ONLY`, never claim autonomous funding support

## 16. Reporting and Reconciliation

## Daily close
At midnight and 06:00 local time:
- read ad platform spend
- read bank settlement activity
- read provider transfer completion state
- compare against planned funding amounts
- write reconciliation record
- surface mismatch severity in Danger Room

## Reporting outputs
- daily treasury report (markdown + JSON)
- exportable monthly ledger for tax/accounting review
- per-platform funding reliability report
- portfolio summary integration

## 17. Metrics

## Product success metrics
- setup completion rate for Stablecoin Treasury
- % of projects reaching first funded campaign launch
- % of reconciliations auto-matched within 24h
- mean time from off-ramp initiation to bank-available funds
- % of spend days with healthy runway > 7 days
- count of frozen incidents per 30 days

## Quality metrics
- false-positive freeze rate
- duplicate transfer prevention rate
- unmatched transfer rate
- stale pending operation rate

## 18. Rollout Plan

## Phase 0 — Architecture and docs
- add PRD
- add patterns and ADRs
- update command docs and Treasury method docs
- implement capability-state modeling only

## Phase 1 — Read-only treasury intelligence
- stablecoin provider read access
- Mercury balance read access
- Google/Meta billing capability classification
- Danger Room visibility
- no live transfers yet

## Phase 2 — Assisted funding
- manual approval for off-ramp initiation
- manual approval for invoice settlement
- full reconciliation pipeline
- freeze/unfreeze controls

## Phase 3 — Policy-driven execution
- limited auto-off-ramp for shared buffer maintenance
- platform-specific funding planner
- portfolio-aware rebalancing

## 19. Testing Requirements

## Unit tests
- branded cents conversions
- funding policy evaluation
- invoice prioritization
- reconciliation tolerance logic
- freeze trigger logic
- idempotency guard behavior

## Integration tests
- stablecoin provider sandbox balance + withdrawal lifecycle
- Mercury sandbox / mock transaction creation
- Google billing capability classification
- Meta billing state classification
- daemon recovery from dirty shutdown with pending funding ops

## Failure-mode tests
- provider timeout mid-transfer
- duplicate webhook / duplicate poll result
- bank settlement arrives without matching funding plan
- spend exceeds forecast before fiat settles
- vault timeout during pending operation
- TOTP rejection on unfreeze

## 20. Risks

1. **Platform billing variability.** Google and Meta billing availability varies by account, geography, and approval state.
2. **Initial setup still partly manual.** Some billing approvals and bank-linking steps cannot be fully automated.
3. **Settlement latency.** Stablecoin redemption and bank availability are not instant in all cases.
4. **False sense of autonomy.** The UI must never imply “set and forget” if the account is only partially supported.
5. **Compliance drift.** Provider and ad platform policies may change faster than campaign APIs do.

## 21. Open Questions

1. Should V1 support only **USDC on approved networks**, or accept other stablecoins in a disabled-but-modeled state?
2. Should Bridge cards be modeled as an experimental funding rail or held entirely for V2?
3. Should Google manual bank transfer with generated reference numbers be treated as `MONITORED_ONLY` or `ASSISTED_FUNDABLE`?
4. Should Meta extended credit and direct debit be separate capability states for policy logic?
5. Should portfolio mode be allowed to reallocate shared operating float across projects automatically, or only recommend reallocations?

## 22. Recommended Build Sequence for VoidForge

1. Add `stablecoin-adapter.ts` and `ad-billing-adapter.ts` patterns
2. Update `/cultivation`, `/grow`, and `/treasury` command docs
3. Extend `TREASURY.md` and `HEARTBEAT.md`
4. Implement read-only provider + billing capability checks
5. Add Danger Room status surfaces
6. Implement funding plan generation + immutable logs
7. Add assisted live transfers behind feature flag
8. Add reconciliation exports and portfolio roll-up

## 23. Acceptance Criteria

The feature is complete for V1 when:

- a user can install Cultivation with **Stablecoin Treasury** selected
- Circle-to-Mercury setup can be configured and verified
- `/grow --setup` classifies Google and Meta billing capability correctly
- Heartbeat can forecast runway and generate funding plans
- Treasury can initiate and track an approved off-ramp action
- daily reconciliation links provider transfer, bank settlement, and platform spend
- Danger Room shows funding status, pending settlements, and freeze states
- all write paths are protected by Vault + TOTP + idempotency
- no financial state is mutated outside Heartbeat

## 24. Recommended Product Copy

Use this exact framing in the UI and docs:

> Cultivation does not pay Google or Meta in crypto directly. It converts approved stablecoin balances into compliant fiat rails, then keeps your ad billing systems funded, monitored, and reconciled.

That sentence is the product truth and should appear in setup, docs, and troubleshooting.
