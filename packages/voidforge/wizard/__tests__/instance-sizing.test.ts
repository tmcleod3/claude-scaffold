/**
 * Instance sizing tests — pure functions for AWS resource recommendations.
 * Tier 2: Pure function, easy win, deterministic outputs.
 */

import { describe, it, expect } from 'vitest';
import { recommendInstanceType, rdsInstanceClass } from '../lib/instance-sizing.js';

describe('recommendInstanceType', () => {
  it('should recommend t3.micro for static sites', () => {
    expect(recommendInstanceType({ type: 'static-site' })).toBe('t3.micro');
  });

  it('should recommend t3.micro for prototypes', () => {
    expect(recommendInstanceType({ type: 'prototype' })).toBe('t3.micro');
  });

  it('should recommend t3.micro for score 0 (no signals)', () => {
    expect(recommendInstanceType({ framework: 'express' })).toBe('t3.micro');
  });

  it('should recommend t3.micro for score 1 (single signal)', () => {
    expect(recommendInstanceType({ framework: 'next.js' })).toBe('t3.micro');
    expect(recommendInstanceType({ database: 'postgres' })).toBe('t3.micro');
  });

  it('should recommend t3.small for score 2', () => {
    expect(recommendInstanceType({ framework: 'next.js', database: 'postgres' })).toBe('t3.small');
  });

  it('should recommend t3.small for score 3', () => {
    expect(recommendInstanceType({ framework: 'next.js', database: 'postgres', cache: 'redis' })).toBe('t3.small');
  });

  it('should recommend t3.medium for score 4+', () => {
    expect(recommendInstanceType({
      framework: 'next.js', database: 'postgres', cache: 'redis', workers: 'yes',
    })).toBe('t3.medium');
  });

  it('should cap at t3.medium (never above)', () => {
    expect(recommendInstanceType({
      framework: 'next.js', database: 'postgres', cache: 'redis',
      workers: 'yes', payments: 'stripe',
    })).toBe('t3.medium');
  });
});

describe('rdsInstanceClass', () => {
  it('should map EC2 instance to db.* class', () => {
    expect(rdsInstanceClass('t3.micro')).toBe('db.t3.micro');
    expect(rdsInstanceClass('t3.small')).toBe('db.t3.small');
    expect(rdsInstanceClass('t3.medium')).toBe('db.t3.medium');
  });
});
