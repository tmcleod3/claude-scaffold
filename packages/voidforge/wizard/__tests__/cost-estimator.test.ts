/**
 * Cost estimator tests — AWS cost estimation and SSE emission.
 */

import { describe, it, expect, vi } from 'vitest';
import { estimateCost, emitCostEstimate } from '../lib/cost-estimator.js';

describe('estimateCost', () => {
  it('returns EC2 cost for VPS target', () => {
    const result = estimateCost('vps', 't3.micro', 'none', 'none');
    expect(result).not.toBeNull();
    expect(result!.total).toBe(8.50);
    expect(result!.breakdown).toHaveLength(1);
    expect(result!.breakdown[0].item).toContain('EC2');
  });

  it('includes RDS cost when database is postgres', () => {
    const result = estimateCost('vps', 't3.micro', 'postgres', 'none');
    expect(result).not.toBeNull();
    expect(result!.breakdown).toHaveLength(2);
    expect(result!.breakdown[1].item).toContain('RDS');
    expect(result!.total).toBe(8.50 + 13.00);
  });

  it('includes ElastiCache cost when cache is redis', () => {
    const result = estimateCost('vps', 't3.micro', 'none', 'redis');
    expect(result).not.toBeNull();
    expect(result!.breakdown).toHaveLength(2);
    expect(result!.breakdown[1].item).toContain('ElastiCache');
    expect(result!.total).toBe(8.50 + 12.00);
  });

  it('includes all three components for full stack', () => {
    const result = estimateCost('vps', 't3.small', 'mysql', 'redis');
    expect(result).not.toBeNull();
    expect(result!.breakdown).toHaveLength(3);
    expect(result!.total).toBe(17.00 + 26.00 + 24.00);
  });

  it('falls back to t3.micro pricing for unknown instance types', () => {
    const result = estimateCost('vps', 't3.xxlarge', 'none', 'none');
    expect(result).not.toBeNull();
    expect(result!.total).toBe(8.50); // t3.micro fallback
  });

  it('returns S3 cost for static target', () => {
    const result = estimateCost('static', 't3.micro', 'none', 'none');
    expect(result).not.toBeNull();
    expect(result!.total).toBe(1.00);
    expect(result!.breakdown[0].item).toContain('S3');
  });

  it('returns null for non-AWS targets', () => {
    expect(estimateCost('vercel', 't3.micro', 'none', 'none')).toBeNull();
    expect(estimateCost('railway', 't3.micro', 'none', 'none')).toBeNull();
    expect(estimateCost('cloudflare', 't3.micro', 'none', 'none')).toBeNull();
  });
});

describe('emitCostEstimate', () => {
  it('emits cost for VPS target', () => {
    const emit = vi.fn();
    emitCostEstimate('vps', 't3.micro', 'none', 'none', emit);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      step: 'cost-estimate',
      status: 'done',
      message: expect.stringContaining('$8.50'),
    }));
  });

  it('emits usage-based message for platform targets', () => {
    const emit = vi.fn();
    emitCostEstimate('vercel', 't3.micro', 'none', 'none', emit);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('usage-based'),
    }));
  });

  it('does not emit for unknown targets', () => {
    const emit = vi.fn();
    emitCostEstimate('docker', 't3.micro', 'none', 'none', emit);
    expect(emit).not.toHaveBeenCalled();
  });
});
