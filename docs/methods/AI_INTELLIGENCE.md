# AI INTELLIGENCE ARCHITECT
## Lead Agent: **Hari Seldon** (Foundation) · Agents: Foundation Universe

> *"The fall is inevitable. The recovery can be guided."*

## Identity

**Hari Seldon** is the founder of psychohistory — a mathematical framework for predicting the behavior of large systems. In VoidForge, he owns the AI intelligence layer: every LLM-powered decision point in a user's application.

The metaphor is precise. Psychohistory predicts outcomes from patterns, adapts when reality deviates (Seldon Crises), and maintains a Plan across time. Modern AI systems do the same: models predict from training data, fail when inputs deviate from expectations, and require orchestration strategies that survive model updates.

**When to use /ai:**
- When the application uses LLM APIs for any purpose (classification, generation, routing, tool-use, orchestration)
- When prompts are written or modified
- When tool-use / function-calling schemas are defined
- When AI orchestration patterns are designed (chains, agent loops, workflows)
- When evaluating whether AI outputs are correct and safe
- Before shipping any AI-powered feature to users

**When NOT to use /ai:**
- For VoidForge's own AI usage (Claude Code sessions) — that's the methodology layer, not the application layer
- For applications with no LLM integration
- For simple static content generation with no runtime AI

## The Foundation Team

| # | Agent | Name | Lens | Key Questions |
|---|-------|------|------|---------------|
| 1 | Model Selector | **Salvor Hardin** | Right model for the job | Is this the right model tier? Could a smaller model handle this? Is the latency budget met? Are you paying for capability you don't use? |
| 2 | Prompt Architect | **Gaal Dornick** | Prompt structure + testability | Is the prompt structured for reliability? Output format specified? Edge cases handled? System prompt defensible against injection? |
| 3 | Tool Schema Validator | **Hober Mallow** | Function definitions | Are tool descriptions clear enough for the model? Parameter types right? Required vs optional correct? Overlapping descriptions? |
| 4 | Orchestration Reviewer | **Bel Riose** | Pattern appropriateness | Simple completion, chain, agent loop, or workflow? Pattern appropriate for reliability requirement? Loops bounded? |
| 5 | Failure Mode Analyst | **The Mule** | Everything that breaks | What happens when the model hallucinates? Refuses? Times out? Context overflows? Is there a fallback? Circuit breaker? |
| 6 | Token Economist | **Ducem Barr** | Cost and efficiency | Token usage tracked? Caching strategies? Context window efficient? System prompts deduplicated? |
| 7 | Eval Specialist | **Bayta Darell** | Measuring correctness | Golden datasets? Automated scoring? Regression suite for prompt changes? Quality degradation detection? |
| 8 | Safety Guardian | **Bliss** | Alignment + protection | Prompt injection risk? PII in prompts? Output safety? System prompt extractable? Content classifiers? |
| 9 | Versioning Specialist | **R. Daneel Olivaw** | Model migrations | When models update, does behavior change? Prompts pinned to versions? Migration strategy? Rollback path? |
| 10 | Observability Engineer | **Dors Venabili** | Seeing everything | Decision audit trail? Inputs/outputs logged (PII-scrubbed)? Latency percentiles? Quality scores over time? |
| 11 | Context Engineer | **Janov Pelorat** | RAG + retrieval | RAG retrieval returning relevant docs? Embeddings right dimensionality? Chunking appropriate? Re-ranking steps? |
| 12 | Output Validator | **Wanda Seldon** | Structured outputs | Schema validation on model responses? Retry on parse failure? Partial outputs handled? Type coercion? |

## Operating Rules

1. **Prompts are code.** Version them. Test them. Review them. A prompt change is a behavior change.
2. **Every AI call must have a fallback path.** The application must function when the model fails.
3. **Token usage must be tracked and bounded.** Unbounded token spend is a billing incident.
4. **Model selection must be justified.** "We used Opus because it's the best" is not a justification. Match capability to task.
5. **Evaluation must exist before shipping.** If you can't measure whether the output is correct, you can't ship it.
6. **Safety review must happen before user-facing AI.** Prompt injection is the new SQL injection.
7. **Observability is not optional.** You must be able to see what the AI decided and why.
8. **Context windows are finite.** Design for it. Don't assume infinite context.
9. **Model updates break things.** Pin model versions. Test after updates.
10. **Confidence scoring is mandatory on all findings.**
11. **Output token limits must have headroom.** Set `max_tokens` to at least 2x expected output size. Detect truncation before rendering: check for unbalanced braces, missing closing tags, or incomplete JSON. Never show a loading spinner on compilation failure — show an explicit error with the truncation point. Token exhaustion produces syntactically broken output that fails silently downstream. (Field report #266: 64K output token limit hit mid-JSX string, client Babel failed silently, loader never removed.)
12. **Critical prohibitions belong in code requirements, not separate sections.** When instructing a model NOT to do something (don't use inline styles, don't hardcode values), place the prohibition adjacent to the positive instruction it relates to, not in a separate "Don'ts" section. Models weight instructions by proximity to the task description. Isolated prohibition sections are weaker than inline constraints. (Field report #266: assembly prompt prohibitions in a separate section were ignored by the model.)

## The AI Review Sequence

### Phase 0 — AI Surface Map (Hari Seldon)

Reconnaissance — find every LLM integration point:

1. Grep for SDK imports: `anthropic`, `@anthropic-ai/sdk`, `openai`, `@ai-sdk`, `langchain`, `llamaindex`
2. Find prompt files/constants: system prompts, few-shot examples, prompt templates
3. Find tool/function definitions: tool-use schemas, function calling configs
4. Find orchestration patterns: agent loops, chains, workflows, DAGs
5. Find eval infrastructure: test suites for AI behavior, golden datasets

Produce: AI Component Inventory

```markdown
| Component | File | Model | Purpose | Pattern |
|-----------|------|-------|---------|---------|
| Customer classifier | src/ai/classify.ts | sonnet | Triage support tickets | Classifier |
| Report generator | src/ai/report.ts | opus | Generate quarterly summary | Completion |
| Order router | src/ai/router.ts | haiku | Route to correct handler | Router |
```

### Phase 1 — Parallel Audits

Launch 4 agents in parallel (independent analysis):

**Agent 1 (Salvor Hardin — Model Selection):**
For each AI component, evaluate:
- Is this the right model tier? (Opus for complex reasoning, Sonnet for balanced, Haiku for speed/classification)
- Is the latency budget met? (User-facing = <2s, background = relaxed)
- Is cost acceptable at projected volume? (Calculate: tokens per request × requests per day × price)
- Does the model support required features? (Tool use, vision, streaming, extended thinking)
- Is a fallback model identified?
- Is the model version pinned (not "latest")?

**Agent 2 (Gaal Dornick — Prompt Architecture):**
For each prompt, evaluate:
- System prompt separated from user prompt?
- Output format explicitly specified? (JSON schema, enum, structured)
- Edge cases addressed? (Empty input, adversarial input, ambiguous input)
- Prompt versioned and stored in dedicated file/constant? (Not inline string)
- Few-shot examples included where accuracy matters?
- Guardrails present? (Explicit refusal instructions for out-of-scope requests)
- Temperature appropriate for the task? (0 for deterministic, higher for creative)

**Agent 3 (Hober Mallow — Tool Schema Validation):**
For each tool definition, evaluate:
- Description clear enough for model to select correctly?
- Parameter types correct? (string vs number vs enum)
- Required vs optional fields correct?
- Descriptions don't overlap with other tools? (Selection confusion)
- Return types documented?
- Error handling defined? (What does the tool return on failure?)

**Agent 4 (Bliss — AI Safety):**
For each AI endpoint, evaluate:
- Can user input reach the system prompt? (Prompt injection)
- Is PII sent to the model? (Data minimization)
- Is the output filtered for harmful content?
- Can the system prompt be extracted via adversarial input?
- Are there content classifiers on outputs?
- Is there a human escalation path for uncertain outputs?

### Phase 2 — Sequential Audits

Run sequentially — each builds on findings from parallel phase:

**Bel Riose (Orchestration):** Review the AI execution patterns.
- Classify each component: simple completion | chain | agent loop | workflow
- For agent loops: is there a `MAX_ITERATIONS` bound?
- For chains: are intermediate results persisted for recovery?
- For workflows: can they resume after failure?
- Are retries bounded with exponential backoff?

**The Mule (Failure Modes):** Adversarial analysis.
- What happens when the model hallucinates? (Is output validated?)
- What happens when the model refuses? (Is there a fallback?)
- What happens when the model is slow? (Timeout + user feedback)
- What happens when context overflows? (Truncation strategy)
- What happens when the API is down? (Circuit breaker)
- What happens when rate limits hit? (Queue or degrade)

**Ducem Barr (Token Economics):** Cost analysis.
- Is token usage tracked per request?
- Are there caching strategies? (Prompt caching, response caching, semantic caching)
- Is the context window used efficiently? (Not stuffing irrelevant context)
- Are system prompts deduplicated across requests?
- Is streaming used where appropriate? (Time to first token)
- Estimated monthly cost at projected volume?

**Bayta Darell (Evaluation):** Quality measurement.
- Does an eval exist for each AI component?
- Are there golden datasets (input/expected-output pairs)?
- Is there automated scoring? (Exact match, semantic similarity, rubric-based)
- Can you detect regression when prompts change?
- Is there human-in-the-loop scoring for ambiguous cases?
- Are quality metrics tracked over time? (Not just at launch)

**Dors Venabili (Observability):** Visibility.
- Can you see what the AI decided and why?
- Are inputs and outputs logged? (With PII scrubbing)
- Are latency percentiles tracked? (p50, p95, p99)
- Are quality scores tracked over time?
- Can you replay a decision for debugging?
- Are anomalies detected? (Sudden quality drop, latency spike)

### Phase 3 — Remediate

Fix all Critical and High findings. Finding format:

```
ID:          AI-[PHASE]-[NUMBER]
Severity:    Critical / High / Medium / Low
Confidence:  [0-100]
Agent:       [Name] (Foundation)
File:        [path:line]
What's wrong: [description]
How to fix:  [specific recommendation]
```

### Phase 4 — Re-Verify

**The Mule + Wanda Seldon** re-probe all remediated areas:
- The Mule: attempts adversarial bypass of safety fixes
- Wanda Seldon: validates structured output schemas are enforced

If issues found, return to Phase 3. Maximum 2 iterations.

## Checklists

### Model Selection Checklist
- [ ] Task complexity matches model capability
- [ ] Latency requirement met by selected model
- [ ] Cost per request acceptable at projected volume
- [ ] Model supports required features (tool use, vision, streaming)
- [ ] Fallback model identified if primary unavailable
- [ ] Model version pinned (not "latest")

### Prompt Engineering Checklist
- [ ] System prompt separated from user prompt
- [ ] Output format explicitly specified
- [ ] Edge cases addressed in prompt
- [ ] Prompt versioned and stored in dedicated file/constant
- [ ] Few-shot examples included where accuracy matters
- [ ] Guardrails present for out-of-scope requests
- [ ] Temperature appropriate for task

### Tool-Use Checklist
- [ ] Tool descriptions unambiguous and non-overlapping
- [ ] Parameter types correct (string/number/enum/boolean)
- [ ] Required vs optional fields correct
- [ ] Return type documented
- [ ] Error handling defined
- [ ] Tool tested in isolation (without model)

### Safety Checklist
- [ ] User input cannot reach system prompt (injection guard)
- [ ] PII minimized in model context
- [ ] Output content filtered/classified
- [ ] System prompt not extractable
- [ ] Human escalation path for uncertain outputs
- [ ] Rate limiting on AI endpoints

### Eval Checklist
- [ ] Golden dataset exists (≥20 input/output pairs)
- [ ] Automated scoring function defined
- [ ] Regression suite runs on prompt changes
- [ ] Quality metrics tracked over time
- [ ] Human review process for edge cases

### AI Gate Bootstrapping (Cold-Start Problem)
AI-gated approval systems have a cold-start problem: no historical outcomes -> gate rejects all requests -> no operations -> no outcomes. During the first N decisions (configurable, default 20), the gate should approve at reduced size (0.5-0.7x normal) to build a track record. The gate should never reject solely because "no historical data exists." Include explicit prompt guidance: "Lack of history is not a reason to reject — approve at reduced size to build the track record." (Field report #152)

## Anti-Patterns

| Anti-Pattern | What Happens | Fix |
|---|---|---|
| Inline prompt strings | Prompts scattered across code, impossible to version or test | Extract to dedicated prompt files/constants |
| Unbounded agent loops | Model runs forever, burning tokens | Add `MAX_ITERATIONS` constant |
| No fallback on model failure | Application crashes when LLM is slow/down | Circuit breaker + graceful degradation |
| "Opus for everything" | 10x cost for tasks that Haiku handles perfectly | Match model tier to task complexity |
| No eval before shipping | No way to know if AI output is correct | Build golden dataset + scoring function |
| PII in prompts | User data sent to model unnecessarily | Data minimization + PII scrubbing |
| Model version "latest" | Behavior changes silently on model update | Pin to specific model version |
| No observability | Can't debug AI decisions in production | Add trace logging + quality metrics |

## Integration with Other Commands

| Command | When Seldon's Team Activates | What They Check |
|---------|------------------------------|-----------------|
| `/build` | Phase 4+ when `ai: yes` in frontmatter | Model selection, prompt structure, basic error handling, eval strategy exists |
| `/gauntlet` | Round 2 as 7th Stone (Wisdom) | Full 12-agent audit alongside other domain leads |
| `/assemble` | Phase 6.5 after integrations | AI-specific review between integrations and admin/ops |
| `/campaign` | Missions with AI features | Seldon review during or after build mission |
| `/security` | Phase 2 — Bliss handoff from Kenobi | Prompt injection, PII, content safety (AI-specific security) |
| `/qa` | Step 3 — Bayta handoff from Batman | AI behavior testing, eval strategy, golden datasets |
| `/review` | Step 1 when AI code in scope | Pattern compliance for prompts, tools, orchestration |
| `/prd` | During PRD generation | AI Architecture section + frontmatter fields |

## PRD Frontmatter Fields

When a project uses AI, the PRD frontmatter should include:

```yaml
ai: yes                           # Activates Seldon's review
ai_provider: "anthropic"          # anthropic | openai | local | multi
ai_models: ["claude-sonnet-4-6"]  # Models used
ai_features: ["classification", "generation", "tool-use", "routing"]
```

The build protocol detects `ai: yes` and activates Seldon's team at relevant phase gates.

## Deliverables

1. AI Component Inventory (all LLM integration points with model, purpose, pattern)
2. Finding log with severity, confidence, and remediation
3. Eval strategy recommendations per component
4. Model selection justification (why this model, not another)
5. Token budget estimate (monthly cost projection)
6. Safety assessment (prompt injection, PII, content risks)
