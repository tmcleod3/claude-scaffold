# /ai — Seldon's AI Intelligence Audit

*"The fall is inevitable. The recovery can be guided."*

The AI Intelligence Audit reviews every LLM-powered component in your application. Seldon's team examines model selection, prompt engineering, tool-use schemas, orchestration patterns, failure modes, token economics, evaluation strategy, safety, versioning, and observability.

## Context Setup
1. Read `/docs/methods/AI_INTELLIGENCE.md` for operating rules
2. Read the PRD — check for `ai: yes` in frontmatter
3. Scan the codebase for LLM integration points: imports from `anthropic`, `@anthropic-ai/sdk`, `openai`, `@langchain`, prompt files, tool definitions

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

## Silver Surfer Pre-Scan (ADR-048)

Before agent deployment, the Silver Surfer selects the optimal roster:

Run: `npx thevoidforge herald --command /ai --json`
(Add `--focus "<topic>"` if the user provided `--focus`)

Parse the JSON output. The `roster` array contains agent IDs to deploy alongside this command's lead agents. If the command fails or returns an empty roster, use the hardcoded manifest below.

**`--focus "topic"`** biases the Surfer toward agents matching the topic.
**`--light`** skips the Surfer — uses only hardcoded core roster.
**`--solo`** skips Surfer and all sub-agents — lead only.

## Phase 0 — AI Surface Map (`subagent_type: Seldon`)

Reconnaissance — find all AI integration points:
1. Grep for LLM SDK imports (`anthropic`, `openai`, `@ai-sdk`, `langchain`)
2. Find prompt files/constants (system prompts, few-shot examples)
3. Find tool/function definitions (tool-use schemas)
4. Find orchestration patterns (agent loops, chains, workflows)
5. Produce: AI component inventory with file paths, model used, and purpose

## Phase 1 — Parallel Audits (4 agents)

Use the Agent tool to run all four in parallel:

- **Agent 1** `subagent_type: Salvor Hardin` — Model selection: right model per call? Smaller/faster alternative? Latency budget met? Cost tracked?
- **Agent 2** `subagent_type: Gaal Dornick` — Prompt architecture: structured, versioned, testable? System prompt separated? Output format specified? Edge cases? Few-shot?
- **Agent 3** `subagent_type: Hober Mallow` — Tool schemas: clear descriptions? Correct parameter types? Required vs optional? No overlapping tools? Return types documented?
- **Agent 4** `subagent_type: Bliss` — AI safety: prompt injection risk? PII in prompts? Output content safety? System prompt extractable? Jailbreak vectors?

## Phase 2 — Sequential Audits (7 agents)

Run sequentially — each builds on the previous:

- **Bel Riose** `subagent_type: Bel Riose` — Orchestration: completion/chain/agent loop/workflow? Reliability appropriate? Loops bounded? State persisted?
- **The Mule** `subagent_type: The Mule` — Failure modes: hallucination, refusal, timeout, context overflow, API down. Fallback? Circuit breaker? Bounded retries?
- **Ducem Barr** `subagent_type: Ducem Barr` — Token economics: usage tracked? Caching? Context window efficient? System prompts deduplicated? Streaming?
- **Bayta Darell** `subagent_type: Bayta Darell` — Evaluation: golden datasets? Automated scoring? Regression suite for prompt changes? Quality degradation detection?
- **Dors Venabili** `subagent_type: Dors Venabili` — Observability: trace logging? Inputs/outputs logged (PII-scrubbed)? Latency tracked? Quality scores?
- **Janov Pelorat** `subagent_type: Janov Pelorat` — Context engineering: RAG retrieval relevance? Embedding dimensionality? Chunking strategy?
- **R. Daneel Olivaw** `subagent_type: R. Daneel Olivaw` — Versioning: behavior change on model updates? Prompts pinned? Migration strategy?

## Phase 3 — Remediate

Fix all Critical and High findings. Use the standard finding format with confidence scores.

## Phase 4 — Re-Verify

**The Mule** `subagent_type: The Mule` + **Wanda Seldon** `subagent_type: Wanda Seldon` re-probe all remediated areas. Wanda validates structured outputs. The Mule attempts adversarial bypass of fixes.

## Arguments
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)
- No arguments → full 5-phase audit of all AI components
- `--prompts` → Focus on prompt engineering only (Gaal Dornick deep dive)
- `--tools` → Focus on tool-use schemas only (Hober Mallow solo)
- `--safety` → Focus on AI safety and prompt injection (Bliss + The Mule)
- `--eval` → Focus on evaluation strategy and test coverage (Bayta Darell solo)
- `--cost` → Focus on token economics and optimization (Ducem Barr solo)

## Deliverables
1. AI component inventory (all LLM integration points)
2. Finding log with severity, confidence, and remediation
3. Eval strategy recommendations
4. Model selection justification for each AI call
5. Token budget estimate

## Handoffs
- Security findings → Kenobi (`/security`)
- Test gaps → Batman (`/qa`, `/test`)
- Architecture concerns → Picard (`/architect`)
- Performance/cost concerns → Kusanagi (`/devops`)
