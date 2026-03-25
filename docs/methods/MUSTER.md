# THE MUSTER — Full-Roster Agent Deployment
## Activation: `--muster` flag on any command

> *"The beacons are lit! Gondor calls for aid!" — Gandalf*
> *"And Rohan will answer." — Théoden*

## Identity

The Muster is VoidForge's maximum-agent protocol. When `--muster` is passed, every agent across all 9 universes that has relevant expertise for the specific task gets deployed. It is not a review protocol (that's the Gauntlet). It is not a build protocol (that's /assemble). It is a **decision-density protocol** — the flag you use when you want every perspective in the room before committing to a direction.

**When to use:** Architecture decisions that affect the whole system. Campaign mission planning for critical features. Build phases where the wrong choice costs days. Any moment where "I wish I'd asked someone else" would be expensive.

**When NOT to use:** Routine missions, bug fixes, documentation updates, or any task where the standard agent roster is sufficient. The Muster is expensive — 30-50 agent launches. Use it for decisions that matter.

## The Protocol

### Step 1 — The Beacons (Gandalf)

Read the task scope and produce a 1-paragraph brief:
- What is being built/decided/designed?
- What domains does it touch? (security, UX, architecture, financial, AI, infra, growth)
- What decisions need to be made?
- What are the stakes if the wrong choice is made?

### Step 2 — The Muster Roll (Théoden)

For each of the 9 universes, evaluate which agents have relevant expertise for **this specific task**. Not "who exists" — "who has something to say."

**Evaluation criteria per agent:**
1. Does this agent's domain overlap with the task? → Include
2. Does this agent's adversarial lens apply? → Include in Wave 3
3. Does this agent bring a unique perspective no other included agent covers? → Include
4. Would this agent's findings be a subset of another agent's? → Exclude (dedup)

**Universe leads (always evaluated, included if relevant):**

| Universe | Lead | Domain | Include When |
|---|---|---|---|
| Star Trek | Picard | Architecture | Architecture, schema, scaling decisions |
| Marvel | Stark | Code Review | Implementation, patterns, integration |
| DC | Batman | QA | Edge cases, error states, testing strategy |
| Tolkien | Galadriel | UX | User-facing changes, a11y, design |
| Star Wars | Kenobi | Security | Auth, encryption, access control, secrets |
| Anime | Kusanagi | DevOps | Deploy, infra, monitoring, networking |
| Cosmere | Kelsier | Growth | Revenue, campaigns, distribution, analytics |
| Foundation | Seldon | AI | LLM integration, prompts, orchestration, safety |
| Dune | Chani | Comms | Remote control, messaging, notifications |

**Extended roster (include when domain matches):**

| Agent | Universe | Include When |
|---|---|---|
| Spock | Star Trek | Schema, data modeling, normalization |
| Scotty | Star Trek | Scaling, performance, service boundaries |
| Torres | Star Trek | Performance architecture, bottlenecks |
| La Forge | Star Trek | Failure modes, graceful degradation |
| Janeway | Star Trek | Novel architectures (event-sourcing, CQRS, serverless) |
| Riker | Star Trek | Trade-off challenges, ADR review |
| Troi | Star Trek | PRD compliance, prose verification |
| Tuvok | Star Trek | Security architecture, auth flow design |
| Kim | Star Trek | API design, REST conventions |
| Banner | Marvel | Edge cases, boundary conditions |
| Strange | Marvel | Complexity analysis, time-sensitive decisions |
| Romanoff | Marvel | Attack surface, reconnaissance |
| Vision | Marvel | Diff analysis, change classification |
| Wong | Marvel | Lessons, pattern promotion |
| Nightwing | DC | Regression testing, re-verification |
| Deathstroke | DC | Adversarial bypass, defense testing |
| Constantine | DC | Cursed code, hidden problems in "clean" areas |
| Oracle | DC | Data analysis, forensics |
| Samwise | Tolkien | Accessibility, screen readers, keyboard nav |
| Éowyn | Tolkien | Enchantment, micro-animations, delight |
| Elrond | Tolkien | Systems integration, council synthesis |
| Celeborn | Tolkien | Design system, visual consistency |
| Ahsoka | Star Wars | Access control, authorization patterns |
| Maul | Star Wars | Adversarial security, bypass attempts |
| Padmé | Star Wars | Functional verification, critical path testing |
| Yoda | Star Wars | Wisdom, architectural longevity |
| Vin | Cosmere | Analytics, metrics, pattern detection |
| Navani | Cosmere | SEO, technical precision, structured data |
| Steris | Cosmere | Budget, forecasting, contingency |
| Szeth | Cosmere | Compliance, legal, policy enforcement |
| Dalinar | Cosmere | Competitive analysis, strategic positioning |
| Salvor Hardin | Foundation | Model selection, cost-performance |
| Gaal Dornick | Foundation | Prompt engineering, guardrails |
| The Mule | Foundation | Adversarial AI, inputs the model can't predict |
| Bayta Darell | Foundation | Evaluation, golden datasets, regression |
| Senku | Anime | Engineering first-principles, science |
| Levi | Anime | Precision, zero-waste execution |
| Spike | Anime | Chaos testing, unexpected interactions |
| Holo | Anime | Economics, trade-offs, market dynamics |

### Step 3 — The Ride (Éomer)

Deploy agents in 3 waves:

**Wave 1 — Vanguard (5-8 agents, parallel):**
Domain leads for every relevant universe. These set the baseline analysis.

**Wave 2 — Main Force (5-10 agents, parallel):**
Supporting experts. Each gets Wave 1's findings as context so they build on (not duplicate) the leads' work.

**Wave 3 — Adversarial (3-5 agents, parallel):**
Challenge agents who specifically try to break what Waves 1-2 recommended:
- **Deathstroke** (DC) — bypasses proposed defenses
- **Maul** (Star Wars) — attacks proposed security
- **The Mule** (Foundation) — adversarial AI testing
- **Constantine** (DC) — finds cursed code in "clean" proposals
- **Riker** (Star Trek) — challenges trade-offs ("Number One, does this hold up?")

### Step 4 — The Council (Théoden + Gandalf)

Synthesize all findings:
1. **Deduplicate** — same finding from multiple agents → keep the most detailed, note agreement
2. **Resolve conflicts** — when agents disagree, present both positions with reasoning
3. **Preserve dissent** — if 8 agents agree and 1 disagrees, the dissent is noted (not suppressed)
4. **Recommend** — unified recommendation with confidence level

## Integration Points

| Command | What `--muster` Does |
|---|---|
| `/architect --muster` | Full 9-universe architecture review (vs Star Trek bridge crew default) |
| `/campaign --muster` | Per-mission full-roster deployment (expensive — use for critical missions only) |
| `/build --muster` | Every build phase gets cross-universe review |
| `/gauntlet --muster` | Synonym for `--infinity` (Gauntlet already has this concept) |

## Intensity Spectrum

```
--fast        Standard agents, reduced passes (skip last 2 rounds/phases)
(default)     Standard agents, full protocol
--muster      Every viable agent, 3 waves, adversarial challenge
--infinity    Every agent as own sub-process, 10 rounds (Gauntlet only)
```

## Cost Awareness

The Muster launches 30-50 agent sub-processes. This consumes significant context. Use it when the decision justifies the investment — architecture choices, security-critical features, financial system design, launch preparation.

For routine work, the standard agent roster is sufficient. The Muster is the heavy artillery, not the sidearm.
