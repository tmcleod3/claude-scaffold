/**
 * Pattern: Data Pipeline (ETL / Staged Processing)
 *
 * Key principles:
 * - Typed stages with validate/transform/load — each stage is a pure function
 * - Pipeline composes stages sequentially with validation between each step
 * - Checkpoint/resume for long-running pipelines (persist progress to disk)
 * - Idempotent processing — safe to re-run via dedup key
 * - Data quality checks at boundaries: null rates, range validation, freshness
 * - Batch vs streaming mode toggle — same stages, different execution
 * - Error handling: skip-and-log vs fail-fast configurable per pipeline
 * - Progress reporting callback for observability
 *
 * Agents: Stark (backend), Banner (data), L (monitoring)
 *
 * Framework adaptations:
 *   Node.js: This file (streams + fs checkpoints)
 *   Python: pandas/polars DataFrames, or Apache Beam for distributed
 *   SQL: dbt models as stages, incremental materialization as checkpointing
 *   Go: Pipeline pattern with channels, errgroup for parallel stages
 */

import { createHash } from 'node:crypto';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Transform, Writable } from 'node:stream';

// ── Stage Interface ─────────────────────────────────────

interface PipelineStage<TIn, TOut> {
  /** Unique name for checkpoint tracking */
  name: string;
  /** Validate input before processing — throw on invalid */
  validate(input: TIn): Promise<void>;
  /** Transform input to output */
  transform(input: TIn): Promise<TOut>;
  /** Optional load step — write to destination (DB, file, API) */
  load?(output: TOut): Promise<void>;
}

// ── Configuration ───────────────────────────────────────

type ErrorMode = 'skip-and-log' | 'fail-fast';
type ExecutionMode = 'batch' | 'streaming';

interface PipelineConfig {
  name: string;
  checkpointDir: string;
  errorMode: ErrorMode;
  executionMode: ExecutionMode;
  /** Dedup key extractor — returns a unique key per record to prevent reprocessing */
  dedupKey?: (record: unknown) => string;
  /** Progress callback — called after each stage completes */
  onProgress?: (stage: string, processed: number, total: number) => void;
  /** Maximum acceptable null rate (0.0 - 1.0) before failing quality check */
  maxNullRate?: number;
}

// ── Data Quality ────────────────────────────────────────

interface QualityReport {
  stage: string;
  recordCount: number;
  nullRates: Record<string, number>;
  rangeViolations: string[];
  schemaErrors: string[];
  freshness: { oldestRecord: string; newestRecord: string } | null;
  passed: boolean;
}

function checkNullRate(
  records: Record<string, unknown>[],
  fields: string[],
  maxRate: number
): { field: string; rate: number }[] {
  const violations: { field: string; rate: number }[] = [];
  for (const field of fields) {
    const nullCount = records.filter(r => r[field] == null).length;
    const rate = records.length > 0 ? nullCount / records.length : 0;
    if (rate > maxRate) {
      violations.push({ field, rate });
    }
  }
  return violations;
}

function checkRange(
  records: Record<string, unknown>[],
  field: string,
  min: number,
  max: number
): string[] {
  const violations: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const val = records[i][field];
    if (typeof val === 'number' && (val < min || val > max)) {
      violations.push(`Record ${i}: ${field}=${val} outside [${min}, ${max}]`);
    }
  }
  return violations;
}

// ── Checkpoint Persistence ──────────────────────────────

interface Checkpoint {
  pipelineName: string;
  completedStages: string[];
  processedKeys: string[];
  lastUpdated: string;
  intermediateData: unknown;
}

async function saveCheckpoint(dir: string, checkpoint: Checkpoint): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const filePath = join(dir, `${checkpoint.pipelineName}.checkpoint.json`);
  await writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

async function loadCheckpoint(dir: string, pipelineName: string): Promise<Checkpoint | null> {
  const filePath = join(dir, `${pipelineName}.checkpoint.json`);
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as Checkpoint;
}

// ── Deduplication ───────────────────────────────────────

function computeDedupHash(record: unknown): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

// ── Pipeline Engine ─────────────────────────────────────

interface StageResult<T> {
  data: T;
  skipped: number;
  errors: Array<{ index: number; error: string }>;
}

class Pipeline {
  private stages: PipelineStage<unknown, unknown>[] = [];
  private config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  /** Add a typed stage — stages chain sequentially */
  addStage<TIn, TOut>(stage: PipelineStage<TIn, TOut>): Pipeline {
    this.stages.push(stage as PipelineStage<unknown, unknown>);
    return this;
  }

  /** Run pipeline with checkpoint/resume support */
  async run<TIn, TOut>(input: TIn): Promise<StageResult<TOut>> {
    const checkpoint = await loadCheckpoint(this.config.checkpointDir, this.config.name);
    const completedStages = new Set(checkpoint?.completedStages ?? []);
    const processedKeys = new Set(checkpoint?.processedKeys ?? []);

    let current: unknown = checkpoint?.intermediateData ?? input;
    let totalSkipped = 0;
    const allErrors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];

      // Skip already-completed stages on resume
      if (completedStages.has(stage.name)) {
        continue;
      }

      try {
        // Validate input to this stage
        await stage.validate(current);

        // Dedup check — skip records already processed
        if (this.config.dedupKey && Array.isArray(current)) {
          const before = (current as unknown[]).length;
          current = (current as unknown[]).filter(record => {
            const key = this.config.dedupKey!(record);
            return !processedKeys.has(key);
          });
          totalSkipped += before - (current as unknown[]).length;
        }

        // Transform
        current = await stage.transform(current);

        // Load (if stage has a load step)
        if (stage.load) {
          await stage.load(current);
        }

        // Track processed keys for idempotency
        if (this.config.dedupKey && Array.isArray(current)) {
          for (const record of current as unknown[]) {
            processedKeys.add(this.config.dedupKey(record));
          }
        }

        // Checkpoint after each stage
        await saveCheckpoint(this.config.checkpointDir, {
          pipelineName: this.config.name,
          completedStages: [...completedStages, stage.name],
          processedKeys: [...processedKeys],
          lastUpdated: new Date().toISOString(),
          intermediateData: current,
        });
        completedStages.add(stage.name);

        // Progress reporting
        const total = Array.isArray(current) ? (current as unknown[]).length : 1;
        this.config.onProgress?.(stage.name, i + 1, this.stages.length);

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        allErrors.push({ index: i, error: `${stage.name}: ${errorMsg}` });

        if (this.config.errorMode === 'fail-fast') {
          throw new Error(`Pipeline failed at stage "${stage.name}": ${errorMsg}`);
        }
        // skip-and-log: continue to next stage with current data
        console.error(JSON.stringify({
          event: 'pipeline.stage.error',
          pipeline: this.config.name,
          stage: stage.name,
          error: errorMsg,
          mode: 'skip-and-log',
        }));
      }
    }

    return {
      data: current as TOut,
      skipped: totalSkipped,
      errors: allErrors,
    };
  }
}

export type {
  PipelineStage, PipelineConfig, QualityReport, Checkpoint, StageResult,
  ErrorMode, ExecutionMode,
};
export {
  Pipeline, saveCheckpoint, loadCheckpoint,
  checkNullRate, checkRange, computeDedupHash,
};

// ── Framework Adaptations ───────────────────────────────
//
// === Python (pandas/polars) ===
//
//   import polars as pl
//
//   class ExtractStage:
//       def validate(self, path: str) -> None:
//           if not Path(path).exists():
//               raise FileNotFoundError(path)
//
//       def transform(self, path: str) -> pl.DataFrame:
//           return pl.read_csv(path)
//
//   class CleanStage:
//       def validate(self, df: pl.DataFrame) -> None:
//           null_rate = df.null_count().sum_horizontal()[0] / (df.height * df.width)
//           if null_rate > 0.3:
//               raise ValueError(f"Null rate {null_rate:.1%} exceeds 30% threshold")
//
//       def transform(self, df: pl.DataFrame) -> pl.DataFrame:
//           return df.drop_nulls().with_columns(
//               pl.col("timestamp").str.to_datetime()
//           )
//
//   # Checkpoint: df.write_parquet("checkpoint/clean.parquet")
//   # Resume: pl.read_parquet("checkpoint/clean.parquet")
//   # Dedup: df.unique(subset=["id"])
//
// === SQL-based ETL (dbt) ===
//
//   -- models/staging/stg_orders.sql
//   -- Each model = one pipeline stage. dbt handles DAG ordering.
//   -- Incremental materialization = checkpoint/resume.
//   {{ config(materialized='incremental', unique_key='order_id') }}
//
//   SELECT order_id, customer_id, amount_cents, created_at
//   FROM {{ source('raw', 'orders') }}
//   {% if is_incremental() %}
//   WHERE created_at > (SELECT MAX(created_at) FROM {{ this }})
//   {% endif %}
//
//   -- Quality: dbt tests (not_null, unique, accepted_values, relationships)
//   -- Dedup: unique_key in incremental config
//   -- Error handling: dbt test --warn-error for fail-fast, default for skip-and-log
