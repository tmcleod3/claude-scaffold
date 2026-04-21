# ADR-061: npm Scoped Package Rename (`thevoidforge*` -> `@voidforge/*`)

- **Status:** Accepted (v23.8.20, 2026-04-20)
- **Deciders:** Thomas McLeod (owner), Picard (architect)
- **Supersedes:** Distribution naming established in ADR-038 (wizard extraction) and ADR-039 (build/publish pipeline), partially.
- **Related:** ADR-038 (wizard extraction), ADR-039 (build/publish pipeline), ADR-058 (template placeholder purge — same class of doc/publish drift).

---

## 1. Context

### 1.1 The drift

VoidForge currently publishes two unscoped npm packages:

| Role | Published name | Local name | Latest published | Local |
|------|----------------|------------|------------------|-------|
| Wizard + CLI | `thevoidforge` | `thevoidforge` | v23.8.12 | v23.8.19 |
| Methodology | `thevoidforge-methodology` | `thevoidforge-methodology` | v23.8.12 | v23.8.19 |

Local packages are six releases ahead of the registry.

The documentation — HOLOCRON.md, README.md, QUICKSTART.md, CLAUDE.md Distribution section, and ~40 other install-command references — canonicalizes the **scoped** names `voidforge` (wizard+CLI) and `@voidforge/methodology`. The runtime code already assumes the scoped name: `packages/voidforge/wizard/lib/project-init.ts` and `.../updater.ts` both call `require.resolve('@voidforge/methodology/package.json')`. That resolve path does not match anything in the published package graph today; it is a latent runtime bug papered over by the fact that `prepack.sh` copies methodology files into `packages/methodology/` at publish time and users who do a full `npx thevoidforge init` receive them via a different path.

### 1.2 Why we got here

The unscoped `voidforge` name on npm is squatted: user `yangshun` published a single `v0.0.1` on 2026-03-29. At ADR-038/ADR-039 (v21.0) the fastest path to ship was to prefix the name with `the` and move on — `thevoidforge` and `thevoidforge-methodology` were the published names. The documentation and the wizard source code, however, were written against the *intended* names `voidforge` and `@voidforge/methodology`. No back-propagation was done. The drift has persisted through ~23 minor releases and is now embedded in:

- 40+ install-command references across docs
- Runtime `require.resolve` calls in the wizard
- Project-root `package.json` workspace scripts (`-w thevoidforge`)
- CLI self-upgrade logic (`npm install -g thevoidforge@latest`)
- CHANGELOG references to both names

### 1.3 Why now

The `@voidforge` scope on npm is **available**. This is a time-limited window: as soon as someone registers `@voidforge`, the scoped rename becomes a rebrand, not a reconciliation. The cost of the drift compounds every release: every new doc file either has to learn the published-vs-intended distinction or ships wrong. The runtime `require.resolve('@voidforge/methodology/...')` is a hard-coded contract that the publish pipeline does not currently satisfy.

### 1.4 Alternatives we are not taking

- **Dispute the `voidforge` squat (npm dispute process).** ~3 weeks, uncertain outcome, discretionary on npm's side, and the squatter is a recognizable user (yangshun) with a single shipped version. Not worth the latency or the lottery.
- **Rebrand to `vforge`.** Unscoped `vforge` is available. But it requires changing 1,597 in-repo references to `voidforge` (agent names, doc prose, identity framing, pattern filenames). The VoidForge brand is load-bearing for the product identity. Rejected.
- **Retro-canonicalize `thevoidforge`.** Swap ~40 doc install commands to `thevoidforge` and update `wizard/lib/*.ts` to `require.resolve('thevoidforge-methodology/...')`. Mechanically tractable, but the documentation intent was always `voidforge` — the name `thevoidforge` exists only because of the 2026-03-29 squat, which this decision routes around.

---

## 2. Decision

Rename the two published packages to their scoped equivalents and publish going forward under only those names.

| Role | Old name (deprecated) | New name (canonical) |
|------|-----------------------|----------------------|
| Wizard + CLI | `thevoidforge` | `@voidforge/cli` |
| Methodology | `thevoidforge-methodology` | `@voidforge/methodology` |

Both packages are published with `--access public` (required for scoped packages to be publicly installable; unscoped packages default to public, scoped packages default to restricted).

### 2.1 Bin name

`@voidforge/cli`'s `bin` field stays as `voidforge` — the binary shortcut users type. The existing `package.json` already declares:

```json
"bin": { "voidforge": "./dist/scripts/voidforge.js" }
```

After rename, `npm install -g @voidforge/cli` still installs a `voidforge` binary on PATH. This means:

- **Install:** `npm install -g @voidforge/cli` (new) or `npx @voidforge/cli <cmd>` (new)
- **Invoke after global install:** `voidforge init`, `voidforge update`, `voidforge herald ...` (unchanged)
- **One-shot npx:** `npx @voidforge/cli init` (new, slightly longer than `npx thevoidforge init`)

We do **not** add `voidforge-cli` or `vforge` as alternate bin names. One binary, one name, the name the user already reads in every doc.

### 2.2 Publish cutover

Single release cutover at v23.8.20. The v23.8.20 tag publishes:

- `@voidforge/cli@23.8.20` (new)
- `@voidforge/methodology@23.8.20` (new)

It does **not** re-publish `thevoidforge@23.8.20` or `thevoidforge-methodology@23.8.20`. Those package names freeze at v23.8.12.

### 2.3 Old-package treatment

After `@voidforge/*@23.8.20` ships and is install-verified:

```
npm deprecate thevoidforge@"*" "Renamed to @voidforge/cli. Install: npm install -g @voidforge/cli"
npm deprecate thevoidforge-methodology@"*" "Renamed to @voidforge/methodology."
```

This keeps existing installs functional (no shim break) while surfacing a clear, actionable deprecation message on every future `npm install` that touches the old names. No shim package. No dual-publish.

---

## 3. Migration strategy — justification

Three options were considered:

### (A) Hard cutover — RECOMMENDED and ACCEPTED

Next release publishes only under the new scoped names. `thevoidforge` freezes at v23.8.12. CHANGELOG calls out the rename; deprecation messages point users at `@voidforge/cli`.

### (B) Dual-publish for N releases

Publish both `thevoidforge` (with `npm deprecate`) and `@voidforge/cli` + `@voidforge/methodology` for N releases. Lets existing users update on their schedule.

### (C) Redirect shim

Final `thevoidforge` patch whose `postinstall` prints a deprecation warning and fails, forcing users to `@voidforge/cli`.

### Why (A)

The premise behind (B) and (C) is "give real users time to migrate." The real-user count on `thevoidforge` is effectively zero:

- Solo-developer project. No external adoption funnel.
- Published docs have **never** matched the published name — every user who read the docs and tried to install already typed `npx voidforge init`, hit the squat, and either bounced or learned `thevoidforge` out-of-band.
- The runtime `require.resolve('@voidforge/methodology/...')` does not match the published graph today, which means the wizard's programmatic path has been subtly broken — so even installed users are not exercising the full surface.
- Weekly download numbers for `thevoidforge` are not material at project scale.

In that condition, dual-publish is theater: it doubles the release matrix (two packages become four), keeps the `thevoidforge` name in CI, CHANGELOG, and the publish workflow for no real-user benefit, and *delays* the doc reconciliation that is the actual goal of this ADR. Option (C)'s install-time fail is hostile to the few users who may exist — better to let the old package keep working and let `npm deprecate`'s message do the informing.

Hard cutover is the honest answer. Users who are on `thevoidforge@23.8.12` keep what they have; the next time they try to update, `npm` tells them the package is deprecated and points at `@voidforge/cli`. No behavior change for existing installs; one command change for future installs.

---

## 4. Consequences

### 4.1 Positive

- **Docs match the registry.** `npx @voidforge/cli init` is copy-pasteable from HOLOCRON, README, QUICKSTART.
- **Runtime `require.resolve('@voidforge/methodology/...')` starts working.** `project-init.ts:60` and `updater.ts:43` no longer point at a non-existent package.
- **Brand preserved.** No 1,597-reference `vforge` rebrand. No agent rename cascade. VoidForge identity intact.
- **Scope owned.** `@voidforge` becomes ours on npm. Future sub-packages (`@voidforge/wizard`, `@voidforge/patterns`, `@voidforge/dangerroom`) have a home.
- **Clear distribution story.** One name in docs, one name in package.json, one name in the wizard, one name in `require.resolve`. The drift introduced in v21.0 is closed.

### 4.2 Negative

- **Install command is four characters longer.** `npm install -g @voidforge/cli` vs. `npm install -g thevoidforge`. The `bin` name `voidforge` stays the same after install, so only the one-time install string changes.
- **Any external blog post, tweet, or third-party how-to referencing `thevoidforge` is now stale.** None are load-bearing; all are self-published by the owner.
- **CI must add `--access public`** to both publish steps (`publish.yml` currently has `--access public` on both — verified, no change needed at the flag level, but the scope requires it so it must not be removed).
- **One-time CHANGELOG callout.** v23.8.20 release notes must name the rename loudly. Users who *did* follow the install docs literally and bounced off the squat deserve a single source of truth that says: "The install command is now `npm install -g @voidforge/cli`."

### 4.3 Mitigation

- CHANGELOG v23.8.20 leads with the rename. Single, prominent section.
- `npm deprecate` on both old names with migration text in the deprecation message.
- A migration note in HOLOCRON.md under a short "Upgrading from v23.8.12 or earlier" subsection. Not a full migration guide — a paragraph, because the user population is small.
- The wizard's CLI self-upgrade (`updater.ts:214` `npm install -g thevoidforge@latest`) must switch to `@voidforge/cli@latest` in the same release; otherwise users running the old CLI will upgrade to nothing.

---

## 5. Alternatives considered (expanded)

### 5.1 Dispute the npm squat on `voidforge`

npm has a package-name dispute process. Timeline: ~3 weeks from filing to adjudication. Outcome: discretionary. The squatted `voidforge` is a single `v0.0.1` published by `yangshun`, a recognized user with other published packages. npm is reluctant to take names from active accounts, even for inactive packages. The scoped rename is available today, permanent, and does not require anyone else's decision. Rejected on latency and uncertainty.

### 5.2 Rebrand to `vforge` (unscoped)

`vforge` is available on npm. But `voidforge` is not just a package name — it is the project's identity across 1,597 in-repo references: agent heraldings, doc prose, the `/void` command, file paths, the brand itself. A full `vforge` rebrand costs weeks and loses the character-name framing that the methodology leans on. Rejected on cost and identity.

### 5.3 Retro-canonicalize `thevoidforge`

Invert the direction: treat the *published* name as canonical, update ~40 docs to say `thevoidforge`, and update `wizard/lib/project-init.ts` + `updater.ts` to `require.resolve('thevoidforge-methodology/...')`. Mechanically smaller than the scoped rename because it only touches docs and two runtime files. Rejected because the name `thevoidforge` exists solely as a workaround for a squat and embeds that workaround in the canonical identity forever. The scoped name is strictly better on brand, and this ADR closes the drift in the correct direction.

### 5.4 Unpublish `thevoidforge`

npm allows unpublish only within 72 hours of publication for packages >24 hours old that have any dependents. `thevoidforge` has been published for months. Not available as a lever. Not desired anyway — existing installs should keep working.

---

## 6. Implementation checklist

Mechanical file edits follow. Picard does not execute these — Coulson does, in the v23.8.20 release batch.

### 6.1 Required for the rename to function

- [ ] `packages/voidforge/package.json` -> `"name": "@voidforge/cli"`. Keep `"bin": { "voidforge": "./dist/scripts/voidforge.js" }` unchanged.
- [ ] `packages/methodology/package.json` -> `"name": "@voidforge/methodology"`. `publishConfig.access` already `public` — verified, no change.
- [ ] Root `package.json` (workspace scripts): `-w thevoidforge` -> `-w @voidforge/cli` on lines 10, 11, 12.
- [ ] `.github/workflows/publish.yml` — `--access public` is already present on both publish steps (lines 50 and 72), verified. No flag change required, but the *scope* means `--access public` is now structurally required (not cosmetic) — document this inline.
- [ ] `.github/workflows/publish.yml` — `npm run typecheck -w voidforge` and `npm run test -w voidforge` (lines 27, 30, 47) — the workspace selector `-w voidforge` is *not* the same as `-w thevoidforge`; verify this is the directory-based selector (`packages/voidforge/`) and not the package-name selector. If it is package-name, change to `-w @voidforge/cli`. **Verification task**, not a blind edit.
- [ ] `packages/voidforge/wizard/lib/updater.ts:214` -> `npm install -g @voidforge/cli@latest` (was `thevoidforge@latest`).
- [ ] `packages/voidforge/scripts/voidforge.ts:40` -> pkg-name check accepts `@voidforge/cli`, `thevoidforge` (legacy), `voidforge` (dev). Three-way compatibility during transition.
- [ ] `packages/voidforge/scripts/voidforge.ts:441` -> `npm view @voidforge/cli version`.
- [ ] `packages/voidforge/scripts/voidforge.ts:456` -> `npx @voidforge/cli update --no-self-update`.

### 6.2 Doc install-command sweep

Replace `thevoidforge` -> `@voidforge/cli` for install/invoke commands in:

- [ ] `HOLOCRON.md` (multiple; ensure root and prepack-copied methodology copy both updated at root — prepack will re-propagate).
- [ ] `README.md`
- [ ] `docs/QUICKSTART.md` (lines 15, 21, 77, 88)
- [ ] `docs/QUICKSTART-WINDOWS.md` (lines 30, 31, 36, 247, 321 — two lines have two occurrences each)
- [ ] `CLAUDE.md` Distribution section (table row: `Wizard + CLI | voidforge` -> `Wizard + CLI | @voidforge/cli`; install-path paragraph)
- [ ] `WORKSHOP.md` (lines 31, 35)
- [ ] `CONTRIBUTING.md` (lines 49, 51, 53)
- [ ] `.claude/commands/void.md` (lines 3, 39, 40, 41, 48)
- [ ] `.claude/commands/dangerroom.md` (line 29)
- [ ] `ROADMAP.md` (lines 20, 41, 55, 735 — the last is historical context, preserve)
- [ ] `docs/methods/GROWTH_STRATEGIST.md` (line 89)
- [ ] `docs/methods/FORGE_KEEPER.md` (line 269)
- [ ] `docs/adrs/ADR-048-silver-surfer-herald.md` (line 19)

**Historical references do not change.** Anywhere a doc says "in v21.0 we published `thevoidforge`" (CHANGELOG, ROADMAP historical sections, VERSION.md line 30) — leave the historical name. It is factually correct.

### 6.3 CHANGELOG v23.8.20 entry

Lead section titled explicitly "npm package rename: `@voidforge/cli` + `@voidforge/methodology`". Must state:

- Old names frozen at v23.8.12 and deprecated.
- New install command: `npm install -g @voidforge/cli` or `npx @voidforge/cli init`.
- `bin` name unchanged — `voidforge` still works after global install.
- Link to this ADR.

### 6.4 Post-publish verification (manual, in order)

- [ ] `npm view @voidforge/cli version` returns `23.9.0`.
- [ ] `npm view @voidforge/methodology version` returns `23.9.0`.
- [ ] `npx @voidforge/cli --version` in a fresh directory returns `23.9.0`.
- [ ] `npx @voidforge/cli init test-app --headless` succeeds end-to-end (exercises `require.resolve('@voidforge/methodology/package.json')` — this is the runtime contract that was latently broken).
- [ ] Provenance attestation present: `npm view @voidforge/cli@23.9.0 --json | jq -e '.dist.attestations'` returns non-null.

### 6.5 Legacy-package deprecation runbook (SEC-008)

**Who runs it:** the npm account owner of `tmcleod3` (same account that owns `thevoidforge` and `thevoidforge-methodology`). NOT the CI automation token, unless that token retains publish permission on both legacy names.

**When:** after the first successful `@voidforge/cli@23.9.0` publish AND after `npm view @voidforge/cli` shows the new package live. Not before — if the scoped publish fails, deprecate-first leaves users stranded on a deprecated old name with no functioning alternative.

**Commands (run from a maintainer laptop with `npm login` + OTP):**

```bash
# Sanity check: confirm you're authenticated as the right publisher
npm whoami  # expect: tmcleod3 (or the canonical maintainer)

# Confirm the new packages are live first
npm view @voidforge/cli version        # expect: 23.9.0
npm view @voidforge/methodology version # expect: 23.9.0

# Then deprecate the legacy names (version range covers every prior publish)
npm deprecate 'thevoidforge@<99.0.0' 'Renamed. Install @voidforge/cli: npm i -g @voidforge/cli'
npm deprecate 'thevoidforge-methodology@*' 'Renamed. Use @voidforge/methodology in your package.json.'

# Verify the deprecation landed
npm view thevoidforge deprecated            # should print the migration message
npm view thevoidforge-methodology deprecated # should print the migration message
```

**Credential handling:** do NOT rotate the legacy-name publish token until the deprecate commands succeed. If the NPM_TOKEN used by CI is already scoped only to `@voidforge/*`, it cannot run `npm deprecate` against `thevoidforge`. Run deprecate from a shell with a personally-scoped token that covers both legacy names, then rotate if desired.

**If the deprecate fails** (e.g., account lockout, 2FA issue, stale token): the scoped packages are still live and usable. Users following current docs are unaffected. Retry the deprecate whenever credentials are restored. Do not block the release on this step.

### 6.6 Final grep (shipping gate)

- [ ] `grep -rn "thevoidforge" .` returns only historical references (CHANGELOG entries for prior versions, ROADMAP history, VERSION.md v23.5.1 line, and this ADR's "old name" mentions).

---

## 7. Bin name decision (explicit)

**Decision:** `@voidforge/cli` exposes one bin: `voidforge`.

Current `bin` field in `packages/voidforge/package.json`:

```json
"bin": { "voidforge": "./dist/scripts/voidforge.js" }
```

Rationale:

- `voidforge` is what every agent doc, CLAUDE.md, HOLOCRON, and user-facing instruction says to type. Changing it to `voidforge-cli` or `vforge` creates *new* drift at the moment we're closing the old drift.
- npm's `bin` resolution under scoped packages is identical to unscoped — the bin name is independent of the package name. `@voidforge/cli` + `bin.voidforge` -> user types `voidforge`.
- `npx @voidforge/cli init` works because npx resolves the package and executes its default bin. Equivalent to `npx -p @voidforge/cli voidforge init`.
- One-off alternate bin names (`voidforge-cli` as an alias) add cognitive load with no user gain. Rejected.

Verification after publish: `which voidforge` after `npm install -g @voidforge/cli` returns a path that chains to `@voidforge/cli/dist/scripts/voidforge.js`.

---

## 8. Path-embedded references audit

The methodology package name appears in code at two runtime paths:

| File | Line | Current | Target |
|------|------|---------|--------|
| `packages/voidforge/wizard/lib/project-init.ts` | 43 (comment) | `@voidforge/methodology package` | no change (already correct) |
| `packages/voidforge/wizard/lib/project-init.ts` | 56 (comment) | `@voidforge/methodology` | no change |
| `packages/voidforge/wizard/lib/project-init.ts` | 60 | `require_.resolve('@voidforge/methodology/package.json')` | no change — **starts working after rename** |
| `packages/voidforge/wizard/lib/project-init.ts` | 68 | error string `@voidforge/methodology package (production)` | no change |
| `packages/voidforge/wizard/lib/updater.ts` | 43 | `require_.resolve('@voidforge/methodology/package.json')` | no change — **starts working after rename** |
| `packages/voidforge/wizard/lib/updater.ts` | 214 | `npm install -g thevoidforge@latest` | `npm install -g @voidforge/cli@latest` |

**Finding:** The wizard's programmatic resolution of the methodology package was written against the *intended* scoped name from day one. It has been latently broken in the published packages since v21.0 — `require.resolve('@voidforge/methodology/...')` cannot succeed in an install tree containing `thevoidforge-methodology`. Any code path exercising this resolve either errors out or (more likely) falls through to a try/catch that silently substitutes a dev path. This ADR incidentally fixes that runtime bug. **Batman (QA) should add a test on the post-install resolve path in the v23.9.0 gate.**

**Addendum (Gauntlet Round 2 — CODE-R2-001, confirmed):** The rename alone is **not sufficient** to make `require.resolve('@voidforge/methodology/package.json')` succeed in a fresh `npx @voidforge/cli init` install. The CLI package must also declare `@voidforge/methodology` as a runtime dependency — otherwise npm does not include it in the install tree. Fix Batch 2 added `"@voidforge/methodology": "*"` to `packages/voidforge/package.json` dependencies. The `*` range ensures the latest scoped methodology is pulled regardless of the CLI version, avoiding the lockstep-bump footgun R4-CURSED-001 identified.

No other path-embedded references exist. `prepack.sh` is directory-based (copies `packages/methodology/` contents) and does not encode the package name — unaffected by the rename.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope publish fails without `--access public` (scoped default is restricted) | LOW — already set | HIGH (release blocked) | Publish workflow already has `--access public`; add inline comment documenting it is structurally required for scoped packages. |
| Users on `thevoidforge@23.8.12` don't see the deprecation message | LOW | LOW | `npm deprecate` surfaces on every subsequent install; CHANGELOG leads with rename. User population is near-zero. |
| CI `-w` workspace selector was package-name based, breaks after rename | MEDIUM | HIGH (CI red) | Verification checklist item 6.1. Test in a pre-release branch before tagging. |
| Wizard's `require.resolve('@voidforge/methodology/...')` uncovers a second latent bug once it actually starts resolving | MEDIUM | MEDIUM | Run `npx @voidforge/cli init` end-to-end post-publish; Batman to add a test (checklist 6.4). |
| Third-party reference (blog, gist, agent catalog) still says `npm install -g thevoidforge` | HIGH | LOW | Accept as cost. Deprecation message is the fallback. |
| Someone else registers `@voidforge` scope in the minutes between this decision and publish | VERY LOW | CRITICAL (blocks the rename) | Execute the rename in the same session the ADR is accepted. Do not wait. |
| Future unscoped consumer tries `npm install voidforge` and still hits the squat | CERTAIN | LOW | Out of our control. Docs no longer point there; the squat is someone else's problem. |

---

## 10. Rollback

If post-publish verification (section 6.4) fails catastrophically:

1. **Do not unpublish** `@voidforge/cli@23.8.20` or `@voidforge/methodology@23.8.20`. npm's 72-hour unpublish window applies, but unpublishing scoped packages mid-rollout creates worse confusion than the failure.
2. Publish a follow-up patch (`@voidforge/cli@23.8.21`) with the fix.
3. Do **not** revive `thevoidforge` publishes. The freeze at v23.8.12 is intentional and one-way.

If the `@voidforge` scope itself becomes problematic (e.g., npm Trust and Safety complaint), the fallback is `@tmcleod3/voidforge-cli` under the personal scope, which is guaranteed-available. This is not anticipated.

---

## 11. Implementation scope

**Target: v23.9.0. Source-level implementation complete pending publish.**

All mechanical edits in section 6.1 and doc sweep in 6.2 are committed in the v23.9.0 release batch. Fix Batch 2 added the methodology runtime dependency declaration (section 8 addendum). No stub code.

This ADR is **not** "fully implemented" until:

- [ ] Both packages are live on npm under the new names (`@voidforge/cli@23.9.0`, `@voidforge/methodology@23.9.0`).
- [ ] Both old names are deprecated with migration messages (§6.5 runbook).
- [ ] Post-publish verification (§6.4) passes all checks, including `npx @voidforge/cli init` end-to-end against the live registry.
- [ ] `grep -rn "thevoidforge" .` returns only historical references (CHANGELOG entries for prior versions, ROADMAP history, VERSION.md v23.5.1 line, and this ADR's "old name" mentions).

## 13. Post-implementation pivot (v23.9.1) — `voidforge-build` over `@voidforge/*`

**Status:** Amendment. Supersedes §2.2's decision to target the `@voidforge` scope.

During the attempted first publish of `@voidforge/cli@23.9.0` (v23.9.0 release), the npm scope claim failed. `npm` CLI has no `org create` command — organization creation is web-only via `npmjs.com/org/create`. On the create-org page, the name `voidforge` was reported as **not available** (likely a squatter-adjacent claim by the same account holding unscoped `voidforge@0.0.1`).

**Path considered:**
- Dispute the squat — slow (~3 weeks), uncertain outcome.
- Try `voidforge-hq` / `voidforge-io` / other scope variants — requires web UI iteration with no programmatic verification.
- Rename to `vforge` (unscoped, available) — user's original suggestion; rejected earlier for brand preservation.
- **Chose: `voidforge-build` (unscoped)** — mirrors the product's domain `voidforge.build` exactly; available today; no org creation needed.

**Final published names:**

| Package | Published Name |
|---------|----------------|
| Wizard + CLI | `voidforge-build` |
| Methodology | `voidforge-build-methodology` |

**Bin name unchanged:** `voidforge`. `npx voidforge-build init` still invokes the `voidforge` binary.

**Legacy compatibility:**
- `packages/voidforge/scripts/voidforge.ts:40` accepts `voidforge-build`, `@voidforge/cli` (never actually published but defended against), `thevoidforge` (legacy publish v21.0-v23.8.12), and unscoped `voidforge` (the squat — unreachable in practice but defensively included).
- Runs with legacy name detection print a migration banner on stderr.

**Migration plan — manual + farewell hybrid (per user authorization 2026-04-20):**

1. Publish `voidforge-build@23.9.1` and `voidforge-build-methodology@23.9.1` (this release).
2. Publish **farewell** `thevoidforge@23.8.20` and `thevoidforge-methodology@23.8.20` — minimal packages whose `bin` prints a migration banner and exits 1. Users with stale `thevoidforge@23.8.12` installs whose self-upgrade fires (because `npm view thevoidforge` returns 23.8.20) will get the banner instead of a new functional CLI.
3. Run `npm deprecate 'thevoidforge@*' "..."` and `npm deprecate 'thevoidforge-methodology@*' "..."` pointing users at `voidforge-build`.
4. `/void` command documents the manual migration as a one-time action (see `.claude/commands/void.md` — "Migrating from thevoidforge or @voidforge/cli" section added in this release).

**Rejected alternative:** publishing `@voidforge/cli` anyway via a workaround. Not possible — scope must exist before publish, and `@voidforge` scope remains unavailable.

**Lessons adjacent to LRN-4:** Published npm name must match install instructions — AND the name must be one you can actually claim. Available for publish is a prerequisite check that should happen BEFORE docs canonicalize a name. Adding to LEARNINGS.md as LRN-5 in a follow-up pass.

---

## 12. Known gaps deferred beyond this ADR

The Victory Gauntlet identified these issues as out-of-scope for v23.9.0. They warrant their own remediation:

- **SEC-001 (CRITICAL, user-action):** `@voidforge` npm scope is unclaimed. A maintainer must run `npm publish` of a placeholder from an authenticated account before any CI tag can succeed. Every day of delay is hijack risk. Hard-coded into the release procedure, NOT solvable in code.
- **SEC-002 (HIGH, user-action):** `NPM_TOKEN` must be rotated to an Automation token with write access on `@voidforge/*` AND the legacy `thevoidforge` (for the deprecate command in §6.5). Hard-coded into the release procedure.
- **Update-flow self-comparison bug (R4-CHAOS-005):** `resolveMethodologySource()` in `packages/voidforge/wizard/lib/updater.ts` walks up from `import.meta.dirname` looking for an ancestor with `CLAUDE.md` + `.claude/commands/`. When invoked from inside a VoidForge project, it finds the project root first and compares the installed methodology against itself, silently reporting "up to date." Fix requires reordering the resolve path: prefer `require.resolve('@voidforge/methodology/package.json')` when the CLI is globally installed; fall back to walkup only for local/dev mode. File follow-up ADR.
- **Silver Surfer Gate hook does not ship to new projects (R5-PADME):** `.claude/settings.json` (hook registration) and `scripts/surfer-gate/` (hook infrastructure) are not included in `packages/methodology/` prepack or `project-init.ts copyMethodology()`. New VoidForge projects receive prose-only enforcement (CLAUDE.md "Silver Surfer Gate" section, which explicitly anticipates this as a prose-backstop). Follow-up ADR needed to ship the hook to user projects if mechanical enforcement is desired for non-monorepo installs.
- **Roster TTL expiry mid-gauntlet (R4-CHAOS-003):** `ROSTER_TTL_SECONDS=600` in `check.sh` causes re-record requirements on runs longer than 10 minutes. Orchestrator re-records cleanly. Raising the TTL (to 1800s) is cheap polish for a future release.
- **Dual-global-install post-upgrade (R4-CHAOS-004):** Users who had `thevoidforge` globally installed before the rename end up with both packages installed after `voidforge update` succeeds. PATH ordering determines which `voidforge` bin runs. Document in CHANGELOG migration note: `npm uninstall -g thevoidforge && npm install -g @voidforge/cli` for a clean switch.

Riker or the next `/engage` review verifies these are done. If any are deferred, the ADR status flips back to Proposed and the deferral is logged here explicitly — no silent carry-forward.

---

## 12. References

- ADR-038 — Wizard extraction (established the two-package structure).
- ADR-039 — Build/publish pipeline (established the CI shape being modified).
- ADR-058 — Template placeholder purge (the precedent for fixing doc-vs-publish drift in a single decisive release).
- `packages/voidforge/package.json` — wizard+CLI manifest.
- `packages/methodology/package.json` — methodology manifest.
- `.github/workflows/publish.yml` — CI publish.
- `packages/methodology/scripts/prepack.sh` — methodology file assembly.
- `packages/voidforge/wizard/lib/project-init.ts`, `.../updater.ts` — runtime resolvers.
- npm docs: [publishing scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages), [npm deprecate](https://docs.npmjs.com/cli/commands/npm-deprecate).

---

**Make it so.**
