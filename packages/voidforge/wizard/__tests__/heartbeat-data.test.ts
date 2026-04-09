/**
 * Heartbeat data tests — readCampaigns() and readTreasurySummary() file-reading logic.
 * Tier 2: Financial data integrity — ensures correct parsing of treasury files.
 */

import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createTempHome, cleanupTempHome } from './helpers/temp-dir.js';

// Create temp dir BEFORE any module import that uses homedir()
const tempDir = await createTempHome();

// Mock homedir so TREASURY_DIR and VOIDFORGE_DIR resolve to temp
vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return { ...original, homedir: () => tempDir };
});

// Mock heavy daemon-core dependencies (heartbeat.ts imports at module level)
vi.mock('../lib/daemon-core.js', () => ({
  writePidFile: vi.fn(),
  checkStalePid: vi.fn().mockResolvedValue(false),
  removePidFile: vi.fn(),
  generateSessionToken: vi.fn().mockResolvedValue('mock-token'),
  validateToken: vi.fn().mockReturnValue(true),
  createSocketServer: vi.fn(),
  startSocketServer: vi.fn(),
  writeState: vi.fn(),
  setupSignalHandlers: vi.fn(),
  JobScheduler: vi.fn().mockImplementation(() => ({ add: vi.fn(), start: vi.fn() })),
  createLogger: vi.fn().mockReturnValue({ log: vi.fn(), close: vi.fn() }),
  STATE_FILE: join(tempDir, '.voidforge', 'heartbeat-state.json'),
  SOCKET_PATH: join(tempDir, '.voidforge', 'heartbeat.sock'),
}));

vi.mock('../lib/financial-vault.js', () => ({
  financialVaultGet: vi.fn(),
  financialVaultLock: vi.fn(),
  financialVaultUnlock: vi.fn(),
}));

vi.mock('../lib/totp.js', () => ({
  totpVerify: vi.fn(),
  totpSessionValid: vi.fn().mockReturnValue(false),
  totpSessionInvalidate: vi.fn(),
}));

vi.mock('../lib/safety-tiers.js', () => ({
  classifyTier: vi.fn(),
  isAutonomouslyAllowed: vi.fn().mockReturnValue(true),
  DEFAULT_TIERS: {},
}));

vi.mock('../lib/oauth-core.js', () => ({
  needsRefresh: vi.fn().mockReturnValue(false),
  handleRefreshFailure: vi.fn(),
  getTokenHealth: vi.fn(),
  tokenVaultKey: vi.fn(),
  deserializeTokens: vi.fn(),
  shouldRotateSessionToken: vi.fn().mockReturnValue(false),
  rotateSessionToken: vi.fn(),
  validateSessionToken: vi.fn().mockReturnValue(true),
}));

// Import after all mocks are set up
const { readCampaigns, readTreasurySummary } = await import('../lib/heartbeat.js');

// ── Path setup ────────────────────────────────────────

const TREASURY = join(tempDir, '.voidforge', 'treasury');
const CAMPAIGNS_DIR = join(TREASURY, 'campaigns');
const SPEND_LOG = join(TREASURY, 'spend-log.jsonl');
const REVENUE_LOG = join(TREASURY, 'revenue-log.jsonl');

// ── Cleanup ───────────────────────────────────────────

afterAll(async () => {
  await cleanupTempHome(tempDir);
});

// ── readCampaigns() ───────────────────────────────────

describe('readCampaigns()', () => {
  beforeEach(async () => {
    // Clean treasury directory between tests
    await rm(TREASURY, { recursive: true, force: true });
  });

  it('should return [] when campaigns dir does not exist', async () => {
    const result = await readCampaigns();
    expect(result).toEqual([]);
  });

  it('should return parsed campaigns from valid JSON files', async () => {
    await mkdir(CAMPAIGNS_DIR, { recursive: true });
    await writeFile(join(CAMPAIGNS_DIR, 'camp-1.json'), JSON.stringify({
      id: 'camp-1', name: 'Test Campaign', status: 'active',
    }));
    await writeFile(join(CAMPAIGNS_DIR, 'camp-2.json'), JSON.stringify({
      id: 'camp-2', name: 'Paused Campaign', status: 'paused',
    }));

    const result = await readCampaigns();

    expect(result).toHaveLength(2);
    const ids = result.map((c: unknown) => (c as { id: string }).id);
    expect(ids).toContain('camp-1');
    expect(ids).toContain('camp-2');
  });

  it('should skip malformed JSON files', async () => {
    await mkdir(CAMPAIGNS_DIR, { recursive: true });
    await writeFile(join(CAMPAIGNS_DIR, 'good.json'), JSON.stringify({
      id: 'good', status: 'active',
    }));
    await writeFile(join(CAMPAIGNS_DIR, 'bad.json'), '{{{not valid json');
    await writeFile(join(CAMPAIGNS_DIR, 'notes.txt'), 'not a json file');

    const result = await readCampaigns();

    // Only the valid .json file should be returned; .txt is ignored (no .json extension)
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe('good');
  });

  it('should skip non-.json files', async () => {
    await mkdir(CAMPAIGNS_DIR, { recursive: true });
    await writeFile(join(CAMPAIGNS_DIR, 'readme.txt'), 'hello');
    await writeFile(join(CAMPAIGNS_DIR, '.DS_Store'), '');

    const result = await readCampaigns();
    expect(result).toEqual([]);
  });
});

// ── readTreasurySummary() ─────────────────────────────

describe('readTreasurySummary()', () => {
  beforeEach(async () => {
    await rm(TREASURY, { recursive: true, force: true });
  });

  it('should return zeros when no log files exist', async () => {
    const result = await readTreasurySummary() as {
      spend: number; revenue: number; net: number; roas: number;
    };

    expect(result.spend).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.net).toBe(0);
    expect(result.roas).toBe(0);
  });

  it('should sum spend and revenue from log files', async () => {
    await mkdir(TREASURY, { recursive: true });

    // Spend log: 3 entries totaling 1500 cents
    const spendLines = [
      JSON.stringify({ amountCents: 500, description: 'Meta ad' }),
      JSON.stringify({ amountCents: 700, description: 'Google ad' }),
      JSON.stringify({ amountCents: 300, description: 'Reddit ad' }),
    ].join('\n');
    await writeFile(SPEND_LOG, spendLines + '\n');

    // Revenue log: 2 entries totaling 4000 cents
    const revenueLines = [
      JSON.stringify({ amountCents: 2500, description: 'Stripe charge' }),
      JSON.stringify({ amountCents: 1500, description: 'Paddle payment' }),
    ].join('\n');
    await writeFile(REVENUE_LOG, revenueLines + '\n');

    const result = await readTreasurySummary() as {
      spend: number; revenue: number; net: number; roas: number;
    };

    expect(result.spend).toBe(1500);
    expect(result.revenue).toBe(4000);
    expect(result.net).toBe(2500); // 4000 - 1500
    expect(result.roas).toBeCloseTo(4000 / 1500, 5); // ~2.67
  });

  it('should clamp negative amountCents to 0 in spend', async () => {
    await mkdir(TREASURY, { recursive: true });

    const spendLines = [
      JSON.stringify({ amountCents: 1000 }),
      JSON.stringify({ amountCents: -500 }), // Should be clamped to 0
      JSON.stringify({ amountCents: 200 }),
    ].join('\n');
    await writeFile(SPEND_LOG, spendLines + '\n');

    const result = await readTreasurySummary() as { spend: number };

    // 1000 + 0 (clamped) + 200 = 1200
    expect(result.spend).toBe(1200);
  });

  it('should skip malformed lines in log files', async () => {
    await mkdir(TREASURY, { recursive: true });

    const spendLines = [
      JSON.stringify({ amountCents: 1000 }),
      '{not valid json',
      JSON.stringify({ amountCents: 500 }),
    ].join('\n');
    await writeFile(SPEND_LOG, spendLines + '\n');

    const result = await readTreasurySummary() as { spend: number };

    // 1000 + 500 = 1500 (malformed line skipped)
    expect(result.spend).toBe(1500);
  });

  it('should handle spend log without revenue log', async () => {
    await mkdir(TREASURY, { recursive: true });
    await writeFile(SPEND_LOG, JSON.stringify({ amountCents: 800 }) + '\n');

    const result = await readTreasurySummary() as {
      spend: number; revenue: number; net: number; roas: number;
    };

    expect(result.spend).toBe(800);
    expect(result.revenue).toBe(0);
    expect(result.net).toBe(-800);
    expect(result.roas).toBe(0); // 0 revenue / 800 spend = 0
  });

  it('should treat missing amountCents as 0', async () => {
    await mkdir(TREASURY, { recursive: true });
    await writeFile(SPEND_LOG, JSON.stringify({ description: 'no amount' }) + '\n');

    const result = await readTreasurySummary() as { spend: number };

    expect(result.spend).toBe(0);
  });
});
