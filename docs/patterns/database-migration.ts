/**
 * Pattern: Database Migration Safety
 *
 * Key principles:
 * - Backward-compatible by default — add columns as nullable, backfill, then constrain
 * - Safe column removal — stop reading in code first, deploy, THEN drop column
 * - Large table operations use batched processing — never full-table locks on >100k rows
 * - Every migration has a tested rollback (down migration)
 * - Data backfills are idempotent — safe to re-run if interrupted mid-batch
 * - Zero-downtime deployments require migration/code ordering discipline
 *
 * Agents: Banner (database), Kusanagi (deploy), Stark (services)
 *
 * Framework adaptations:
 *   Prisma (Node.js): This file — raw SQL for batched ops, Prisma Migrate for schema
 *   Alembic (Python/FastAPI): op.add_column(), op.batch_alter_table(), bulk_insert()
 *   ActiveRecord (Rails): add_column with default, change_column_null, in_batches
 *   Django: AddField(null=True), RunPython for data migrations, SeparateDatabaseAndState
 *
 * === Alembic Deep Dive ===
 *
 *   # alembic/versions/001_add_display_name.py
 *   from alembic import op
 *   import sqlalchemy as sa
 *
 *   def upgrade():
 *       # Step 1: Add nullable column
 *       op.add_column('users', sa.Column('display_name', sa.String(255), nullable=True))
 *
 *   def downgrade():
 *       op.drop_column('users', 'display_name')
 *
 *   # Step 2 (separate migration): Backfill + constrain
 *   # alembic/versions/002_backfill_display_name.py
 *   from alembic import op
 *   from sqlalchemy import text
 *
 *   def upgrade():
 *       conn = op.get_bind()
 *       while True:
 *           result = conn.execute(text(
 *               "UPDATE users SET display_name = name "
 *               "WHERE display_name IS NULL LIMIT 1000"
 *           ))
 *           if result.rowcount == 0:
 *               break
 *       op.alter_column('users', 'display_name', nullable=False)
 *
 *   def downgrade():
 *       op.alter_column('users', 'display_name', nullable=True)
 *
 * === ActiveRecord (Rails) Deep Dive ===
 *
 *   # db/migrate/001_add_display_name_to_users.rb
 *   class AddDisplayNameToUsers < ActiveRecord::Migration[7.1]
 *     def change
 *       add_column :users, :display_name, :string, null: true
 *     end
 *   end
 *
 *   # db/migrate/002_backfill_display_name.rb
 *   class BackfillDisplayName < ActiveRecord::Migration[7.1]
 *     disable_ddl_transaction!  # Required for batched operations
 *
 *     def up
 *       User.where(display_name: nil).in_batches(of: 1000) do |batch|
 *         batch.update_all("display_name = name")
 *       end
 *       change_column_null :users, :display_name, false
 *     end
 *
 *     def down
 *       change_column_null :users, :display_name, true
 *     end
 *   end
 *
 * === Django Deep Dive ===
 *
 *   # migrations/0001_add_display_name.py
 *   from django.db import migrations, models
 *
 *   class Migration(migrations.Migration):
 *       operations = [
 *           migrations.AddField(
 *               model_name='user',
 *               name='display_name',
 *               field=models.CharField(max_length=255, null=True),
 *           ),
 *       ]
 *
 *   # migrations/0002_backfill_display_name.py
 *   from django.db import migrations
 *
 *   def backfill_display_name(apps, schema_editor):
 *       User = apps.get_model('users', 'User')
 *       batch_size = 1000
 *       while True:
 *           ids = list(
 *               User.objects.filter(display_name__isnull=True)
 *                   .values_list('id', flat=True)[:batch_size]
 *           )
 *           if not ids:
 *               break
 *           User.objects.filter(id__in=ids).update(display_name=models.F('name'))
 *
 *   class Migration(migrations.Migration):
 *       operations = [
 *           migrations.RunPython(backfill_display_name, migrations.RunPython.noop),
 *           migrations.AlterField(
 *               model_name='user',
 *               name='display_name',
 *               field=models.CharField(max_length=255, null=False),
 *           ),
 *       ]
 *
 * See /docs/patterns/service.ts for service layer conventions.
 */

// ── Types ────────────────────────────────────────────────

/** A single migration step with forward and rollback operations. */
interface MigrationStep {
  /** Unique identifier, e.g. "20260324_001_add_display_name" */
  id: string;
  /** Human-readable description of what this migration does */
  description: string;
  /** Forward migration — applies the schema or data change */
  up: (ctx: MigrationContext) => Promise<void>;
  /** Rollback migration — reverses the forward change */
  down: (ctx: MigrationContext) => Promise<void>;
  /** If true, this migration uses batched processing for large tables */
  batched?: boolean;
  /** If true, this migration is a data-only change (no schema DDL) */
  dataOnly?: boolean;
}

interface MigrationContext {
  /** Execute raw SQL — use for DDL and batched operations */
  execute: (sql: string, params?: unknown[]) => Promise<{ rowCount: number }>;
  /** Structured logger */
  log: (event: string, data: Record<string, unknown>) => void;
}

/** Configuration for chunked data backfill operations. */
interface BackfillConfig {
  /** Table to backfill */
  table: string;
  /** SET clause for the UPDATE statement */
  setClause: string;
  /** WHERE clause to identify rows needing backfill */
  whereClause: string;
  /** Rows per batch — keep under 5000 to avoid lock contention */
  batchSize: number;
  /** Optional: column to checkpoint progress (must be indexed) */
  checkpointColumn?: string;
  /** Optional: resume from this checkpoint value */
  resumeFrom?: string | number;
  /** Delay between batches in ms — gives replicas time to catch up */
  delayMs?: number;
}

// ── Backward-Compatible Column Addition ──────────────────

/**
 * Safe pattern: Add a column in two migrations.
 *
 * Migration 1: Add column as nullable (no default — avoids full table rewrite)
 * Migration 2: Backfill data + add NOT NULL constraint
 *
 * WHY two migrations: A single ALTER TABLE ... ADD COLUMN ... NOT NULL
 * on a table with millions of rows will lock the table for the duration
 * of the rewrite. Splitting into nullable-add + backfill + constrain
 * keeps each lock short.
 */
const addDisplayNameStep1: MigrationStep = {
  id: '20260324_001_add_display_name_nullable',
  description: 'Add display_name column as nullable (safe for zero-downtime)',
  async up(ctx) {
    await ctx.execute(`
      ALTER TABLE users
      ADD COLUMN display_name VARCHAR(255) NULL
    `);
    ctx.log('migration.column_added', { table: 'users', column: 'display_name', nullable: true });
  },
  async down(ctx) {
    await ctx.execute(`ALTER TABLE users DROP COLUMN display_name`);
    ctx.log('migration.column_dropped', { table: 'users', column: 'display_name' });
  },
};

const addDisplayNameStep2: MigrationStep = {
  id: '20260324_002_backfill_display_name',
  description: 'Backfill display_name from name, then add NOT NULL constraint',
  batched: true,
  dataOnly: true,
  async up(ctx) {
    // Backfill in batches — see batchProcess() below
    await batchProcess(ctx, {
      table: 'users',
      setClause: 'display_name = name',
      whereClause: 'display_name IS NULL',
      batchSize: 1000,
      delayMs: 100,
    });

    // Only constrain AFTER all rows are backfilled
    await ctx.execute(`ALTER TABLE users ALTER COLUMN display_name SET NOT NULL`);
    ctx.log('migration.constraint_added', { table: 'users', column: 'display_name', constraint: 'NOT NULL' });
  },
  async down(ctx) {
    await ctx.execute(`ALTER TABLE users ALTER COLUMN display_name DROP NOT NULL`);
    ctx.log('migration.constraint_removed', { table: 'users', column: 'display_name', constraint: 'NOT NULL' });
  },
};

// ── Safe Column Removal (Two-Phase) ─────────────────────

/**
 * Removing a column requires TWO deploys:
 *
 * Deploy 1: Update code to stop reading/writing the column.
 *   - Remove from SELECT queries, ORM select/include lists
 *   - Remove from INSERT/UPDATE statements
 *   - Deploy this code change FIRST
 *
 * Deploy 2: Drop the column in a migration (this step).
 *   - Only safe AFTER Deploy 1 is live and stable
 *   - If you drop before Deploy 1, existing instances will crash
 *
 * For Prisma: remove the field from schema.prisma in Deploy 1,
 * run `prisma generate` (updates client), then `prisma migrate`
 * to drop the column in Deploy 2.
 */
const dropLegacyAvatarUrl: MigrationStep = {
  id: '20260324_003_drop_legacy_avatar_url',
  description: 'Drop avatar_url column (code already stopped reading it in v16.0)',
  async up(ctx) {
    await ctx.execute(`ALTER TABLE users DROP COLUMN IF EXISTS avatar_url`);
    ctx.log('migration.column_dropped', { table: 'users', column: 'avatar_url' });
  },
  async down(ctx) {
    // Restore the column as nullable — data is gone, but schema is recoverable
    await ctx.execute(`ALTER TABLE users ADD COLUMN avatar_url TEXT NULL`);
    ctx.log('migration.column_restored', { table: 'users', column: 'avatar_url', note: 'data not recoverable' });
  },
};

// ── Batched Processing for Large Tables ─────────────────

/**
 * Process rows in chunks to avoid full-table locks.
 *
 * Key behaviors:
 * - Updates batchSize rows per iteration
 * - Logs progress after each batch (structured JSON)
 * - Supports checkpoint/resume via checkpointColumn
 * - Idempotent: re-running processes only remaining unprocessed rows
 * - Optional delay between batches for replica catch-up
 */
async function batchProcess(
  ctx: MigrationContext,
  config: BackfillConfig
): Promise<{ totalProcessed: number }> {
  const { table, setClause, whereClause, batchSize, checkpointColumn, resumeFrom, delayMs } = config;
  let totalProcessed = 0;
  let checkpoint = resumeFrom;

  while (true) {
    // Build WHERE clause with optional checkpoint for resumability
    let fullWhere = whereClause;
    if (checkpointColumn && checkpoint !== undefined) {
      fullWhere = `${whereClause} AND ${checkpointColumn} > ${typeof checkpoint === 'string' ? `'${checkpoint}'` : checkpoint}`;
    }

    // Use a subquery to limit the batch — avoids locking rows beyond the batch
    const sql = `
      UPDATE ${table}
      SET ${setClause}
      WHERE id IN (
        SELECT id FROM ${table}
        WHERE ${fullWhere}
        ORDER BY ${checkpointColumn ?? 'id'}
        LIMIT ${batchSize}
      )
    `;

    const result = await ctx.execute(sql);

    if (result.rowCount === 0) {
      break; // All rows processed
    }

    totalProcessed += result.rowCount;

    ctx.log('migration.batch_processed', {
      table,
      batchSize: result.rowCount,
      totalProcessed,
    });

    // Optional delay — prevents replica lag on high-traffic tables
    if (delayMs && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  ctx.log('migration.backfill_complete', { table, totalProcessed });
  return { totalProcessed };
}

// ── Zero-Downtime Migration Safety Validation ───────────

interface MigrationSafetyResult {
  safe: boolean;
  violations: string[];
  warnings: string[];
}

/**
 * Validate a migration SQL string against zero-downtime rules.
 *
 * Run this in CI or as a pre-migration hook. Catches the most common
 * migration mistakes that cause downtime or data loss.
 */
function validateMigrationSafety(sql: string): MigrationSafetyResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const upperSql = sql.toUpperCase();

  // Rule 1: No bare NOT NULL without DEFAULT on ADD COLUMN
  if (/ADD\s+COLUMN\s+\w+\s+\w+.*NOT\s+NULL/i.test(sql) && !/DEFAULT/i.test(sql)) {
    violations.push(
      'ADD COLUMN with NOT NULL but no DEFAULT — will fail on existing rows. ' +
      'Add as nullable first, backfill, then add constraint in a separate migration.'
    );
  }

  // Rule 2: No DROP COLUMN without IF EXISTS
  if (/DROP\s+COLUMN\s+(?!IF\s+EXISTS)/i.test(sql)) {
    warnings.push(
      'DROP COLUMN without IF EXISTS — migration will fail if column already dropped. ' +
      'Use DROP COLUMN IF EXISTS for idempotent migrations.'
    );
  }

  // Rule 3: No RENAME COLUMN (breaks running code)
  if (/RENAME\s+COLUMN/i.test(sql)) {
    violations.push(
      'RENAME COLUMN causes downtime — old code references the old name. ' +
      'Instead: add new column, backfill, update code, drop old column.'
    );
  }

  // Rule 4: No ALTER TYPE on large tables without checking
  if (/ALTER\s+(COLUMN\s+)?\w+\s+(SET\s+DATA\s+)?TYPE/i.test(sql)) {
    warnings.push(
      'ALTER TYPE may rewrite the entire table. Verify table size and consider ' +
      'add-new-column + backfill + swap strategy for large tables.'
    );
  }

  // Rule 5: No CREATE INDEX without CONCURRENTLY (PostgreSQL)
  if (/CREATE\s+INDEX\s+(?!CONCURRENTLY)/i.test(sql) && !/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY/i.test(sql)) {
    if (!/CONCURRENTLY/i.test(sql)) {
      warnings.push(
        'CREATE INDEX without CONCURRENTLY locks writes for the duration. ' +
        'Use CREATE INDEX CONCURRENTLY for zero-downtime.'
      );
    }
  }

  // Rule 6: No LOCK TABLE
  if (upperSql.includes('LOCK TABLE')) {
    violations.push(
      'Explicit LOCK TABLE will block queries. Use row-level locking or batched operations.'
    );
  }

  // Rule 7: UPDATE/DELETE without LIMIT or batching hint
  if (/(?:UPDATE|DELETE\s+FROM)\s+\w+\s+SET/.test(sql) || /DELETE\s+FROM\s+\w+\s+WHERE/.test(sql)) {
    if (!/LIMIT/i.test(sql) && !/IN\s*\(\s*SELECT/i.test(sql)) {
      warnings.push(
        'UPDATE/DELETE without LIMIT or subquery batch — may lock entire table. ' +
        'Use batchProcess() for large operations.'
      );
    }
  }

  return {
    safe: violations.length === 0,
    violations,
    warnings,
  };
}

// ── Migration Runner (simplified) ───────────────────────

/**
 * Execute a list of migration steps in order.
 * In production, use your framework's migration runner (Prisma Migrate,
 * Alembic, ActiveRecord, Django). This shows the pattern.
 */
async function runMigrations(
  steps: MigrationStep[],
  ctx: MigrationContext,
  direction: 'up' | 'down' = 'up'
): Promise<void> {
  const ordered = direction === 'down' ? [...steps].reverse() : steps;

  for (const step of ordered) {
    ctx.log('migration.start', { id: step.id, direction, description: step.description });

    try {
      if (direction === 'up') {
        await step.up(ctx);
      } else {
        await step.down(ctx);
      }

      ctx.log('migration.complete', { id: step.id, direction });
    } catch (error) {
      ctx.log('migration.failed', {
        id: step.id,
        direction,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error; // Stop on first failure — do not continue with partial state
    }
  }
}

// ── Prisma-Specific Notes ───────────────────────────────
/*
  Prisma Migrate generates SQL from schema.prisma changes.
  For safe migrations with Prisma:

  1. Add column as optional first:
     model User {
       displayName String?  // nullable
     }
     Run: npx prisma migrate dev --name add_display_name

  2. Backfill via raw SQL (Prisma doesn't generate data migrations):
     import { PrismaClient } from '@prisma/client'
     const prisma = new PrismaClient()
     // Use $executeRaw for batched updates
     let updated = 1
     while (updated > 0) {
       updated = await prisma.$executeRaw`
         UPDATE users SET display_name = name
         WHERE display_name IS NULL
         LIMIT 1000
       `
     }

  3. Make column required:
     model User {
       displayName String  // non-nullable
     }
     Run: npx prisma migrate dev --name require_display_name

  For column removal:
  1. Remove field from schema.prisma, run prisma generate (updates client)
  2. Deploy code (app no longer reads/writes the column)
  3. Run prisma migrate dev --name drop_avatar_url (generates DROP COLUMN)
*/
