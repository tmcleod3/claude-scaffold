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

**MANDATORY — NO EXCEPTIONS.** Launch the Silver Surfer before deploying ANY other agents. This is not negotiable, not deferrable, and not skippable regardless of how simple the task appears. "The task is simple" is NOT a valid reason to skip — the Surfer catches cross-domain relevance that you cannot predict. "I already know which agents to use" is NOT a valid reason — the Surfer reads agent definitions you haven't loaded. Skipping the Surfer is a protocol violation equivalent to skipping the Victory Gauntlet. **If you find yourself thinking "I don't need the Surfer for this" — that is exactly when you need it most.**

Read the `heralding:` field from `.claude/agents/silver-surfer-herald.md` and announce it before launching.

**How to launch:** Use the Agent tool with these exact parameters:
- `description`: "Silver Surfer roster scan"
- `prompt`: "You are the Silver Surfer, Herald of Galactus. Read your instructions from .claude/agents/silver-surfer-herald.md, then execute your task. Command: /ai. User args: <ARGS>. Focus: <FOCUS or 'none'>. Scan the .claude/agents/ directory, read agent descriptions and tags, and return the optimal roster for this command on this codebase."

**After the Surfer returns**, deploy the FULL roster — every agent the Surfer selected. Do NOT cherry-pick "key specialists" from the list. The Surfer already curated it. Launch all of them alongside this command's hardcoded leads.

**`--focus "topic"`** — include in the Surfer's prompt as the focus bias.
**`--light`** — skip the Surfer, use only hardcoded roster below.
**`--solo`** — skip Surfer and all sub-agents, lead only.

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
