/**
 * Agent Memory — Cross-project lesson storage and retrieval.
 *
 * After each build, key learnings are stored here. When starting a new build,
 * relevant lessons are loaded into methodology context.
 * "Last time you built a Next.js app with Stripe, Phase 6 failed because
 * webhook signatures weren't verified in test mode."
 *
 * Wong guards the knowledge. The Sanctum grows.
 *
 * Storage: ~/.voidforge/lessons.json (0600 permissions).
 * Never stores credentials or PII — only methodology learnings.
 */

import { readFile, rename, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';

const VOIDFORGE_DIR = join(homedir(), '.voidforge');
const LESSONS_PATH = join(VOIDFORGE_DIR, 'lessons.json');
const MAX_LESSONS = 1000; // Cap to prevent unbounded growth

export interface Lesson {
  id: string;
  framework: string;
  category: string;
  lesson: string;
  action: string;
  project: string;
  agent: string;
  createdAt: string;
}

export type LessonInput = Omit<Lesson, 'id' | 'createdAt'>;

// ── Write serialization ────────────────────────────

let writeQueue: Promise<void> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, () => fn());
  writeQueue = result.then(() => {}, () => {});
  return result;
}

// ── File I/O ───────────────────────────────────────

async function readLessons(): Promise<Lesson[]> {
  try {
    const raw = await readFile(LESSONS_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidLesson);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw new Error(`Lessons file corrupted: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

async function writeLessons(lessons: Lesson[]): Promise<void> {
  await mkdir(VOIDFORGE_DIR, { recursive: true });
  const data = JSON.stringify(lessons, null, 2);
  const tmpPath = LESSONS_PATH + '.tmp';
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmpPath, LESSONS_PATH);
}

function isValidLesson(obj: unknown): obj is Lesson {
  if (typeof obj !== 'object' || obj === null) return false;
  const l = obj as Record<string, unknown>;
  return (
    typeof l.id === 'string' &&
    typeof l.framework === 'string' &&
    typeof l.category === 'string' &&
    typeof l.lesson === 'string' &&
    typeof l.action === 'string' &&
    typeof l.project === 'string' &&
    typeof l.agent === 'string' &&
    typeof l.createdAt === 'string'
  );
}

// ── Public API ─────────────────────────────────────

/** Add a lesson. Returns the created lesson with ID and timestamp. */
export function addLesson(input: LessonInput): Promise<Lesson> {
  return serialized(async () => {
    const lessons = await readLessons();
    const lesson: Lesson = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    lessons.push(lesson);
    // Evict oldest if over cap
    if (lessons.length > MAX_LESSONS) {
      lessons.splice(0, lessons.length - MAX_LESSONS);
    }
    await writeLessons(lessons);
    return lesson;
  });
}

/** Get all lessons, optionally filtered. */
export async function getLessons(filters?: {
  framework?: string;
  category?: string;
  project?: string;
}): Promise<Lesson[]> {
  const lessons = await readLessons();
  if (!filters) return lessons;

  return lessons.filter((l) => {
    if (filters.framework && l.framework !== filters.framework) return false;
    if (filters.category && l.category !== filters.category) return false;
    if (filters.project && l.project !== filters.project) return false;
    return true;
  });
}

/** Get lessons relevant to a build context (by framework). */
export async function getRelevantLessons(
  framework: string,
): Promise<Lesson[]> {
  const lessons = await readLessons();
  return lessons.filter((l) =>
    l.framework === framework || l.framework === 'any',
  );
}

/** Get total lesson count. */
export async function getLessonCount(): Promise<number> {
  const lessons = await readLessons();
  return lessons.length;
}
