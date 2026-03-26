/**
 * Platform-specific funding planner tests — Google invoice settlement,
 * Meta debit protection, and portfolio rebalancing.
 * Tier 1: Financial core — wrong plans mean wrong wire instructions or overspend.
 */

import { describe, it, expect } from 'vitest';
import {
  planGoogleInvoiceSettlement,
  planMetaDebitProtection,
  generatePortfolioRebalancing,
} from '../lib/financial/platform-planner.js';
import type {
  GoogleInvoice,
  ExpectedDebit,
  ProjectTreasury,
} from '../lib/financial/platform-planner.js';
import type { Cents } from '../../docs/patterns/funding-plan.js';
import { toCents } from '../../docs/patterns/funding-plan.js';

const cents = (n: number) => n as Cents;

// ── planGoogleInvoiceSettlement ──────────────────────

describe('planGoogleInvoiceSettlement', () => {
  it('should settle overdue invoices before pending invoices', () => {
    const invoices: GoogleInvoice[] = [
      { invoiceId: 'inv-1', amountCents: cents(5_000), dueDate: '2026-04-10', status: 'pending' },
      { invoiceId: 'inv-2', amountCents: cents(3_000), dueDate: '2026-03-01', status: 'overdue' },
    ];
    const plans = planGoogleInvoiceSettlement(invoices, cents(50_000), cents(10_000));
    expect(plans.length).toBeGreaterThanOrEqual(2);
    // Overdue (inv-2) should come first
    expect(plans[0].invoiceId).toBe('inv-2');
    expect(plans[0].priority).toBe(1);
    expect(plans[1].invoiceId).toBe('inv-1');
    expect(plans[1].priority).toBe(2);
  });

  it('should sort by nearest due date among pending invoices', () => {
    const invoices: GoogleInvoice[] = [
      { invoiceId: 'inv-far', amountCents: cents(2_000), dueDate: '2026-05-15', status: 'pending' },
      { invoiceId: 'inv-near', amountCents: cents(3_000), dueDate: '2026-04-01', status: 'pending' },
    ];
    const plans = planGoogleInvoiceSettlement(invoices, cents(50_000), cents(10_000));
    expect(plans[0].invoiceId).toBe('inv-near');
    expect(plans[1].invoiceId).toBe('inv-far');
  });

  it('should skip invoices that would breach the buffer target', () => {
    const invoices: GoogleInvoice[] = [
      { invoiceId: 'inv-small', amountCents: cents(5_000), dueDate: '2026-04-01', status: 'pending' },
      { invoiceId: 'inv-big', amountCents: cents(40_000), dueDate: '2026-04-05', status: 'pending' },
    ];
    // Bank: $50k, buffer: $10k. After inv-small: $45k. inv-big would leave $5k < $10k buffer.
    const plans = planGoogleInvoiceSettlement(invoices, cents(50_000), cents(10_000));
    expect(plans).toHaveLength(1);
    expect(plans[0].invoiceId).toBe('inv-small');
    expect(plans[0].remainingBufferAfterCents).toBe(45_000);
  });

  it('should skip paid invoices', () => {
    const invoices: GoogleInvoice[] = [
      { invoiceId: 'inv-paid', amountCents: cents(5_000), dueDate: '2026-04-01', status: 'paid' },
      { invoiceId: 'inv-pending', amountCents: cents(3_000), dueDate: '2026-04-05', status: 'pending' },
    ];
    const plans = planGoogleInvoiceSettlement(invoices, cents(50_000), cents(10_000));
    expect(plans).toHaveLength(1);
    expect(plans[0].invoiceId).toBe('inv-pending');
  });

  it('should return empty array for no invoices', () => {
    const plans = planGoogleInvoiceSettlement([], cents(50_000), cents(10_000));
    expect(plans).toHaveLength(0);
  });

  it('should include wire reference in each plan', () => {
    const invoices: GoogleInvoice[] = [
      { invoiceId: 'inv-1', amountCents: cents(5_000), dueDate: '2026-04-01', status: 'pending' },
    ];
    const plans = planGoogleInvoiceSettlement(invoices, cents(50_000), cents(10_000));
    expect(plans[0].wireReference).toContain('GOOG-INV-inv-1');
  });
});

// ── planMetaDebitProtection ──────────────────────────

describe('planMetaDebitProtection', () => {
  it('should return correct deficit when balance is insufficient', () => {
    // Debits within 7 days: $5,000. Buffer: $3,000. Required: $8,000. Bank: $6,000.
    // Deficit: $8,000 - $6,000 = $2,000
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const debits: ExpectedDebit[] = [
      { date: threeDays.toISOString(), amountCents: cents(5_000) },
    ];
    const deficit = planMetaDebitProtection(debits, cents(6_000), cents(3_000));
    expect(deficit).toBe(2_000);
  });

  it('should return zero when buffer is sufficient', () => {
    const now = new Date();
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const debits: ExpectedDebit[] = [
      { date: threeDays.toISOString(), amountCents: cents(2_000) },
    ];
    // Bank: $20,000. Need: $2,000 + $3,000 = $5,000. Surplus.
    const deficit = planMetaDebitProtection(debits, cents(20_000), cents(3_000));
    expect(deficit).toBe(0);
  });

  it('should return zero for empty debits list', () => {
    const deficit = planMetaDebitProtection([], cents(10_000), cents(5_000));
    expect(deficit).toBe(0);
  });

  it('should exclude debits beyond 7-day window', () => {
    const now = new Date();
    const tenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const debits: ExpectedDebit[] = [
      { date: tenDays.toISOString(), amountCents: cents(50_000) },
    ];
    // Debit is beyond 7 days — should be excluded, so deficit = 0
    const deficit = planMetaDebitProtection(debits, cents(5_000), cents(3_000));
    // Only buffer target matters: $3,000 - $5,000 = negative → 0
    expect(deficit).toBe(0);
  });

  it('should sum multiple debits within the window', () => {
    const now = new Date();
    const twoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const fiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const debits: ExpectedDebit[] = [
      { date: twoDays.toISOString(), amountCents: cents(3_000) },
      { date: fiveDays.toISOString(), amountCents: cents(4_000) },
    ];
    // Total debits: $7,000. Buffer: $2,000. Required: $9,000. Bank: $6,000. Deficit: $3,000.
    const deficit = planMetaDebitProtection(debits, cents(6_000), cents(2_000));
    expect(deficit).toBe(3_000);
  });
});

// ── generatePortfolioRebalancing ─────────────────────

describe('generatePortfolioRebalancing', () => {
  it('should transfer from overfunded to underfunded projects', () => {
    const projects: ProjectTreasury[] = [
      {
        projectId: 'proj-rich',
        projectName: 'Rich Project',
        bankBalanceCents: cents(200_000),
        minimumBufferCents: cents(10_000),
        dailySpendRateCents: cents(1_000),
        runwayDays: 200,
      },
      {
        projectId: 'proj-poor',
        projectName: 'Poor Project',
        bankBalanceCents: cents(5_000),
        minimumBufferCents: cents(10_000),
        dailySpendRateCents: cents(1_000),
        runwayDays: 5,
      },
    ];
    // Rich target: $10k + ($1k * 30) = $40k. Excess: $200k - $40k = $160k.
    // Poor target: $10k + ($1k * 30) = $40k. Deficit: $5k - $40k = -$35k.
    const recs = generatePortfolioRebalancing(projects);
    expect(recs).toHaveLength(1);
    expect(recs[0].fromProjectId).toBe('proj-rich');
    expect(recs[0].toProjectId).toBe('proj-poor');
    expect(recs[0].amountCents).toBe(35_000);
    expect(recs[0].reason).toContain('Rich Project');
    expect(recs[0].reason).toContain('Poor Project');
  });

  it('should return empty array for a single project', () => {
    const projects: ProjectTreasury[] = [
      {
        projectId: 'proj-only',
        projectName: 'Solo',
        bankBalanceCents: cents(100_000),
        minimumBufferCents: cents(10_000),
        dailySpendRateCents: cents(500),
        runwayDays: 200,
      },
    ];
    expect(generatePortfolioRebalancing(projects)).toHaveLength(0);
  });

  it('should return empty when all projects are balanced', () => {
    const projects: ProjectTreasury[] = [
      {
        projectId: 'proj-a',
        projectName: 'A',
        bankBalanceCents: cents(40_000),
        minimumBufferCents: cents(10_000),
        dailySpendRateCents: cents(1_000),
        runwayDays: 40,
      },
      {
        projectId: 'proj-b',
        projectName: 'B',
        bankBalanceCents: cents(40_000),
        minimumBufferCents: cents(10_000),
        dailySpendRateCents: cents(1_000),
        runwayDays: 40,
      },
    ];
    // Both at target: $10k + ($1k * 30) = $40k. Excess: 0 each.
    expect(generatePortfolioRebalancing(projects)).toHaveLength(0);
  });

  it('should handle multiple overfunded and underfunded projects', () => {
    const projects: ProjectTreasury[] = [
      {
        projectId: 'rich-1',
        projectName: 'Rich One',
        bankBalanceCents: cents(100_000),
        minimumBufferCents: cents(5_000),
        dailySpendRateCents: cents(500),
        runwayDays: 200,
      },
      {
        projectId: 'rich-2',
        projectName: 'Rich Two',
        bankBalanceCents: cents(80_000),
        minimumBufferCents: cents(5_000),
        dailySpendRateCents: cents(500),
        runwayDays: 160,
      },
      {
        projectId: 'poor-1',
        projectName: 'Poor One',
        bankBalanceCents: cents(5_000),
        minimumBufferCents: cents(5_000),
        dailySpendRateCents: cents(1_000),
        runwayDays: 5,
      },
    ];
    // Rich-1 target: $5k + ($500 * 30) = $20k. Excess: $80k.
    // Rich-2 target: $5k + ($500 * 30) = $20k. Excess: $60k.
    // Poor-1 target: $5k + ($1k * 30)  = $35k. Deficit: $30k.
    const recs = generatePortfolioRebalancing(projects);
    expect(recs.length).toBeGreaterThanOrEqual(1);
    // Total transferred should cover $30k deficit
    const totalTransferred = recs.reduce((sum, r) => sum + r.amountCents, 0);
    expect(totalTransferred).toBe(30_000);
  });
});
