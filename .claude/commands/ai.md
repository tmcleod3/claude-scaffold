# /ai — Seldon's AI Intelligence Audit

*"The fall is inevitable. The recovery can be guided."*

The AI Intelligence Audit reviews every LLM-powered component in your application. Seldon's team examines model selection, prompt engineering, tool-use schemas, orchestration patterns, failure modes, token economics, evaluation strategy, safety, versioning, and observability.

## Context Setup
1. Read `/docs/methods/AI_INTELLIGENCE.md` for operating rules
2. Read the PRD — check for `ai: yes` in frontmatter
3. Scan the codebase for LLM integration points: imports from `anthropic`, `@anthropic-ai/sdk`, `openai`, `@langchain`, prompt files, tool definitions

## Phase 0 — AI Surface Map (Hari Seldon)

Reconnaissance — find all AI integration points:
1. Grep for LLM SDK imports (`anthropic`, `openai`, `@ai-sdk`, `langchain`)
2. Find prompt files/constants (system prompts, few-shot examples)
3. Find tool/function definitions (tool-use schemas)
4. Find orchestration patterns (agent loops, chains, workflows)
5. Produce: AI component inventory with file paths, model used, and purpose

## Phase 1 — Parallel Audits (4 agents)

Use the Agent tool to run all four in parallel:

- **Agent 1 (Salvor Hardin — Model Selection):** For each AI call, is this the right model? Could a smaller/faster model handle it? Is the latency budget met? Is cost tracked?
- **Agent 2 (Gaal Dornick — Prompt Architecture):** Are prompts structured, versioned, testable? System prompt separated? Output format specified? Edge cases handled? Few-shot where needed?
- **Agent 3 (Hober Mallow — Tool Schemas):** Are tool descriptions clear? Parameter types correct? Required vs optional right? No overlapping tools? Return types documented?
- **Agent 4 (Bliss — AI Safety):** Prompt injection risk? PII in prompts? Output content safety? System prompt extractable? Jailbreak vectors?

## Phase 2 — Sequential Audits (5 agents)

Run sequentially — each builds on the previous:

- **Bel Riose (Orchestration):** Is this a completion, chain, agent loop, or workflow? Appropriate for the reliability requirement? Loops bounded? Maximum iteration count? Intermediate state persisted?
- **The Mule (Failure Modes):** What happens when the model hallucinates? Refuses? Times out? Context overflows? API is down? Is there a fallback? Circuit breaker? Bounded retries?
- **Ducem Barr (Token Economics):** Token usage tracked per request? Caching strategies? Context window efficient? System prompts deduplicated? Streaming where appropriate?
- **Bayta Darell (Evaluation):** How do you know outputs are correct? Golden datasets? Automated scoring? Regression suite for prompt changes? Quality degradation detection?
- **Dors Venabili (Observability):** Can you see what the AI decided and why? Trace logging? Inputs/outputs logged (PII-scrubbed)? Latency tracked? Quality scores over time?
- **Janov Pelorat (Context Engineering):** RAG retrieval returning relevant docs? Embeddings right dimensionality? Chunking appropriate?
- **R. Daneel Olivaw (Versioning):** When models update, does behavior change? Prompts pinned? Migration strategy?

## Phase 3 — Remediate

Fix all Critical and High findings. Use the standard finding format with confidence scores.

## Phase 4 — Re-Verify

**The Mule + Wanda Seldon** re-probe all remediated areas. Wanda validates structured outputs. The Mule attempts adversarial bypass of fixes.

## Arguments
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
