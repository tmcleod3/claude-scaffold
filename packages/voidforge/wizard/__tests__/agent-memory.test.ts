/**
 * Agent memory tests — lesson CRUD and filtering.
 * Tier 2: Mocked filesystem, serialized writes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))),
  mkdir: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.resolve({
    writeFile: vi.fn(() => Promise.resolve()),
    sync: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  })),
}));

import {
  addLesson,
  getLessons,
  getRelevantLessons,
  getLessonCount,
} from '../lib/agent-memory.js';
import type { LessonInput } from '../lib/agent-memory.js';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeLessonInput(overrides: Partial<LessonInput> = {}): LessonInput {
  return {
    framework: 'next.js',
    category: 'deployment',
    lesson: 'Webhook signatures must be verified in test mode',
    action: 'Add STRIPE_WEBHOOK_SECRET to .env.test',
    project: 'my-project',
    agent: 'Batman',
    ...overrides,
  };
}

describe('addLesson', () => {
  it('creates a lesson with UUID and timestamp', async () => {
    const lesson = await addLesson(makeLessonInput());
    expect(lesson.id).toBeTruthy();
    expect(lesson.createdAt).toBeTruthy();
    expect(lesson.framework).toBe('next.js');
    expect(lesson.agent).toBe('Batman');
  });
});

describe('getLessons', () => {
  it('returns empty array when store is empty', async () => {
    const lessons = await getLessons();
    expect(lessons).toEqual([]);
  });

  it('returns empty array with filters when store is empty', async () => {
    const lessons = await getLessons({ framework: 'django' });
    expect(lessons).toEqual([]);
  });
});

describe('getRelevantLessons', () => {
  it('returns empty array when no lessons match framework', async () => {
    const lessons = await getRelevantLessons('rails');
    expect(lessons).toEqual([]);
  });
});

describe('getLessonCount', () => {
  it('returns 0 when store is empty', async () => {
    const count = await getLessonCount();
    expect(count).toBe(0);
  });
});
