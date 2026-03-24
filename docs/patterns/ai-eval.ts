/**
 * Pattern: AI Eval
 *
 * Key principles:
 * - Every AI feature needs a golden dataset — input/expected-output pairs
 * - Automated eval runs catch regressions before they reach production
 * - Compare scores across prompt versions — never ship a prompt that scores lower
 * - Scoring functions are pluggable — exact match, semantic similarity, custom
 * - Eval results are stored, not printed — you need history to detect drift
 *
 * Agents: Batman (testing/validation), Picard (architecture), L (monitoring)
 *
 * Provider note: Eval runs use the same model call patterns from ai-orchestrator.ts.
 * The eval framework itself is provider-agnostic.
 */

// --- Core types ---

/** A single test case in a golden dataset. */
export interface EvalCase<TInput = string, TExpected = string> {
  id: string // Stable ID for tracking across runs
  input: TInput
  expected: TExpected
  tags?: string[] // e.g., ['edge-case', 'billing', 'multi-language']
}

/** Result of evaluating a single case. */
export interface CaseResult {
  caseId: string
  passed: boolean
  score: number // 0.0 - 1.0
  actual: string // What the model returned
  expected: string // What we wanted
  latencyMs: number
  error?: string // If the model call failed
}

/** Aggregate result of an eval run. */
export interface EvalResult {
  runId: string
  promptVersion: string
  model: string
  timestamp: string
  totalCases: number
  passedCases: number
  averageScore: number
  averageLatencyMs: number
  caseResults: CaseResult[]
  tags: Record<string, { count: number; avgScore: number }> // Per-tag breakdown
}

/** Comparison between two eval runs. */
export interface VersionComparison {
  baseVersion: string
  candidateVersion: string
  baseScore: number
  candidateScore: number
  delta: number // Positive = improvement, negative = regression
  regressions: CaseResult[] // Cases that got worse
  improvements: CaseResult[] // Cases that got better
  verdict: 'pass' | 'fail' | 'review' // Based on regression threshold
}

// --- Scoring functions ---

/** Exact string match (case-insensitive). */
export function exactMatch(actual: string, expected: string): number {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase() ? 1.0 : 0.0
}

/** Check if expected value is contained in actual output. */
export function containsMatch(actual: string, expected: string): number {
  return actual.toLowerCase().includes(expected.toLowerCase()) ? 1.0 : 0.0
}

/** JSON field match — compare specific fields in JSON outputs. */
export function jsonFieldMatch(
  actual: string,
  expected: string,
  fields: string[]
): number {
  try {
    const actualObj = JSON.parse(actual)
    const expectedObj = JSON.parse(expected)
    let matches = 0
    for (const field of fields) {
      if (actualObj[field] === expectedObj[field]) matches++
    }
    return matches / fields.length
  } catch {
    return 0.0 // Parse failure = score 0
  }
}

// --- EvalSuite ---

type ModelRunner = (input: string) => Promise<string>
type ScoringFunction = (actual: string, expected: string) => number

export class EvalSuite<TInput = string> {
  private cases: EvalCase<TInput, string>[] = []
  private scoreFn: ScoringFunction = exactMatch
  private passThreshold = 0.8 // Case passes if score >= this

  constructor(private name: string) {}

  /** Add a test case to the suite. */
  addCase(testCase: EvalCase<TInput, string>): this {
    this.cases.push(testCase)
    return this
  }

  /** Add multiple test cases. */
  addCases(cases: EvalCase<TInput, string>[]): this {
    this.cases.push(...cases)
    return this
  }

  /** Set the scoring function (default: exactMatch). */
  withScoring(fn: ScoringFunction): this {
    this.scoreFn = fn
    return this
  }

  /** Set the pass threshold (default: 0.8). */
  withPassThreshold(threshold: number): this {
    this.passThreshold = threshold
    return this
  }

  /** Run the eval suite against a model runner function. */
  async run(
    runner: ModelRunner,
    promptVersion: string,
    model: string
  ): Promise<EvalResult> {
    const runId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const caseResults: CaseResult[] = []

    // Run cases sequentially to avoid rate limits. For large suites,
    // batch with concurrency limit (e.g., p-limit with concurrency 5).
    for (const testCase of this.cases) {
      const start = Date.now()
      let actual = ''
      let error: string | undefined

      try {
        actual = await runner(testCase.input as string)
      } catch (e) {
        error = e instanceof Error ? e.message : 'Unknown error'
      }

      const score = error ? 0 : this.scoreFn(actual, testCase.expected)

      caseResults.push({
        caseId: testCase.id,
        passed: score >= this.passThreshold,
        score,
        actual,
        expected: testCase.expected,
        latencyMs: Date.now() - start,
        error,
      })
    }

    // Compute per-tag breakdowns
    const tags: Record<string, { count: number; avgScore: number }> = {}
    for (const testCase of this.cases) {
      for (const tag of testCase.tags ?? []) {
        if (!tags[tag]) tags[tag] = { count: 0, avgScore: 0 }
        const result = caseResults.find((r) => r.caseId === testCase.id)
        if (result) {
          tags[tag].count++
          tags[tag].avgScore += result.score
        }
      }
    }
    for (const tag of Object.values(tags)) {
      tag.avgScore = tag.avgScore / tag.count
    }

    return {
      runId,
      promptVersion,
      model,
      timestamp: new Date().toISOString(),
      totalCases: this.cases.length,
      passedCases: caseResults.filter((r) => r.passed).length,
      averageScore: caseResults.reduce((sum, r) => sum + r.score, 0) / caseResults.length,
      averageLatencyMs: caseResults.reduce((sum, r) => sum + r.latencyMs, 0) / caseResults.length,
      caseResults,
      tags,
    }
  }
}

// --- Version comparison ---

const REGRESSION_THRESHOLD = 0.02 // 2% drop triggers review

export function compareVersions(
  base: EvalResult,
  candidate: EvalResult
): VersionComparison {
  const delta = candidate.averageScore - base.averageScore

  // Find regressions: cases that scored lower in the candidate
  const regressions: CaseResult[] = []
  const improvements: CaseResult[] = []

  for (const candidateCase of candidate.caseResults) {
    const baseCase = base.caseResults.find((b) => b.caseId === candidateCase.caseId)
    if (!baseCase) continue

    if (candidateCase.score < baseCase.score) regressions.push(candidateCase)
    if (candidateCase.score > baseCase.score) improvements.push(candidateCase)
  }

  let verdict: VersionComparison['verdict'] = 'pass'
  if (delta < -REGRESSION_THRESHOLD) verdict = 'fail'
  else if (regressions.length > 0) verdict = 'review'

  return {
    baseVersion: base.promptVersion,
    candidateVersion: candidate.promptVersion,
    baseScore: base.averageScore,
    candidateScore: candidate.averageScore,
    delta,
    regressions,
    improvements,
    verdict,
  }
}

// --- Usage example ---

// const suite = new EvalSuite('ticket-classifier')
//   .withScoring(jsonFieldMatch)
//   .addCases([
//     { id: 'billing-1', input: 'I was charged twice', expected: '{"label":"billing"}', tags: ['billing'] },
//     { id: 'tech-1', input: 'App crashes on login', expected: '{"label":"technical"}', tags: ['technical'] },
//   ])
//
// const baseResult = await suite.run(classifyV1, '2024.01.01', 'claude-sonnet-4-20250514')
// const candidateResult = await suite.run(classifyV2, '2024.01.15', 'claude-sonnet-4-20250514')
// const comparison = compareVersions(baseResult, candidateResult)
//
// if (comparison.verdict === 'fail') {
//   console.error(`Regression detected: ${comparison.delta.toFixed(3)} score drop`)
//   process.exit(1) // Fail CI
// }

/**
 * Framework adaptations:
 *
 * Express:
 *   - Run evals in CI (GitHub Actions) on prompt file changes
 *   - Store EvalResult in S3/database for historical comparison
 *   - Endpoint to trigger eval: POST /api/admin/eval (admin-only)
 *
 * FastAPI:
 *   - Same EvalSuite shape in Python with pytest fixtures
 *   - Use pytest-benchmark for latency tracking
 *   - Store results in PostgreSQL with SQLAlchemy models
 *   - CI: run eval suite in GitHub Actions, compare with previous run
 *
 * Django:
 *   - Management command: python manage.py run_eval --suite ticket-classifier
 *   - EvalResult and CaseResult as Django models for admin dashboard
 *   - Compare versions in admin: side-by-side eval result view
 *   - Celery task for large eval suites (100+ cases)
 */
