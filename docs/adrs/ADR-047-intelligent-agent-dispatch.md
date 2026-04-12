# ADR-047: Intelligent Agent Dispatch (The Herald)

## Status: Accepted

## Context

VoidForge has 263 materialized agents across 9 universes. Currently, each command has a hardcoded agent manifest — `/review` always calls the same 5 agents, `/qa` the same 7. ADR-044 added dynamic dispatch (scan `git diff --stat`, match against agent descriptions), but this is reactive and conservative: it only adds agents when files change, not when the codebase content demands different expertise.

The result: a financial app gets the same `/review` agents as a game. A security-critical auth refactor gets the same `/qa` team as a CSS tweak. Users want more agents debating, comparing notes, and fighting to the best answer — on every call.

User feedback: "No one cares about over-select. Context and compute are expanding rapidly. All people care about is getting to the correct answer in the least amount of prompts."

## Decision

Add a **Haiku pre-scan step ("The Herald")** to every major slash command. Before any domain agents launch, a single Haiku call reads the full context and selects the optimal agent roster from all 263 agents.

### The Herald Protocol

**Step 0 of every major command** (before the command's own Step 0):

1. **Haiku scout** reads:
   - The command being run (`/review`, `/qa`, `/security`, etc.)
   - The user's arguments and `--focus` bias (if provided)
   - The codebase file tree (`find . -name "*.ts" -o -name "*.tsx" -o -name "*.py" | head -80`)
   - The PRD frontmatter (if `docs/PRD.md` exists)
   - The git diff summary (if uncommitted changes exist)
   - The full agent registry: all 263 agent names + one-line descriptions from `.claude/agents/`

2. **Haiku outputs** a JSON object:
   ```json
   {
     "roster": ["kenobi-security", "worf-security-arch", "ahsoka-access-control", "tuvok-deep-current", ...],
     "reasoning": "Auth refactor touching JWT + RBAC + session management. Security universe (full), plus Trek security architects, plus DC authorization testers.",
     "estimated_agents": 22
   }
   ```

3. **Opus merges** the Herald's roster with the command's hardcoded lead agents (leads are never removed — Herald adds, never subtracts).

4. **All selected agents launch** per the command's normal parallel/sequential protocol.

### Why Haiku

- **Cost:** ~$0.001 per scan. 263 one-line descriptions fit in ~15K tokens — well within Haiku's sweet spot.
- **Speed:** <2 seconds. The scan runs before any Opus agents launch, so it doesn't add perceived latency.
- **Accuracy:** Classification and selection (not generation) is Haiku's strongest capability. Reading 263 descriptions and checking "is this agent relevant to a financial app with auth?" is exactly what it's good at.
- **Bias toward inclusion:** Haiku is instructed to over-include rather than under-include. A false positive (unnecessary agent) costs one sub-agent launch. A false negative (missing agent) costs a missed finding that requires another user prompt to catch.

### Flag Changes

```
(default)       Herald selects optimal roster from 263 agents
--focus "X"     Bias Herald toward topic X (additive, not exclusive)
--light         Skip Herald entirely, use command's hardcoded core roster
--solo          Lead agent only (no Herald, no sub-agents)
```

`--focus` is the only new flag. It's a natural-language string that biases the Herald's selection. Examples:
- `--focus "security"` — Herald weights all security-adjacent agents higher
- `--focus "financial accuracy"` — Herald pulls in Dockson, Steris, treasury agents, math-heavy QA
- `--focus "mobile UX"` — Herald pulls in mobile specialists from every universe

Without `--focus`, the Herald uses the codebase content + command type to make its own judgment.

### Commands That Get The Herald

All Tier 1 commands with agent deployment:
`/review`, `/qa`, `/security`, `/ux`, `/architect`, `/build`, `/assemble`, `/gauntlet`, `/campaign`, `/test`, `/devops`, `/deploy`, `/ai`, `/assess`

Commands that DON'T get the Herald (no agent deployment):
`/git`, `/void`, `/prd`, `/vault`, `/imagine`, `/debrief`, `/thumper`

### Agent Definition Changes

Each agent's `.claude/agents/{id}.md` already has a `description` field in YAML frontmatter. No changes needed — the Herald reads these descriptions as-is.

Optional enhancement: add a `tags` field to agent frontmatter for faster Herald matching:
```yaml
tags: [security, auth, access-control, rbac]
```
Tags supplement the description but don't replace it. Herald uses both.

## Consequences

**Enables:**
- Every command automatically gets the right team for the codebase, not a generic roster
- Users get to correct answers in fewer prompts (more agents = more findings per pass = fewer iterations)
- Cross-domain expertise surfaces automatically (Worf reviews security implications of architecture changes, Dockson spots financial edge cases in QA)
- `--focus` gives users a natural-language dial without learning universe names

**Trade-offs:**
- More agent launches per command (15-40 instead of 5-10). This is the explicit goal — users want more agents working.
- Haiku adds ~2 seconds before command execution. Acceptable given the quality improvement.
- Herald selection is probabilistic, not deterministic. Same command on same codebase may select slightly different rosters. This is acceptable — diversity of perspective is a feature.

**Prevents:**
- Can no longer predict exact agent roster before running a command (use `--light` for predictability)
- Old `--muster` behavior (everyone regardless of relevance) is replaced by the Herald's intelligent selection

## Alternatives

1. **Manual universe flags (`--star-wars`, `--cosmere`)** — Rejected. Users think in topics, not IPs. Forces users to learn universe-domain mapping. Explodes flag taxonomy.

2. **Semantic search against descriptions (Opus-based)** — Rejected. Too expensive for a pre-scan ($0.05+ per call vs $0.001 for Haiku). Opus should do the thinking, not the routing.

3. **Static tag-based lookup tables** — Rejected. Rigid, requires manual maintenance, can't capture cross-domain relevance. A security-relevant UX agent wouldn't be tagged `security` in a static system.

4. **No pre-scan, just expand all rosters** — Rejected. 263 agents on every command is wasteful even if cost isn't a concern. The Herald's value is curation — selecting the 20-40 most relevant, not dumping all 263.
