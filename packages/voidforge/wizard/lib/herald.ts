/**
 * The Herald — intelligent agent dispatch via Haiku pre-scan.
 *
 * Before every major slash command, a single Haiku call selects the optimal
 * agent roster from all agents based on the current context. ADR-048.
 */

import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { execCommand } from './exec.js';

// ── Types ───────────────────────────────────────────────

export interface HeraldInput {
  command: string;
  userArgs: string;
  focus?: string;
  fileTree: string[];
  prdFrontmatter?: string;
  gitDiffSummary?: string;
}

export interface AgentEntry {
  id: string;
  name: string;
  description: string;
  model: string;
  tags?: string[];
}

export interface HeraldResult {
  roster: string[];
  reasoning: string;
  estimatedAgents: number;
}

// ── Constants ───────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const HERALD_TIMEOUT_MS = 10_000;
const FILE_TREE_LIMIT = 80;
const PRD_HEAD_LINES = 30;

// ── Herald core ─────────────────────────────────────────

function buildPrompt(input: HeraldInput, agents: AgentEntry[]): string {
  const agentList = agents
    .map((a) => {
      const tags = a.tags?.length ? ` [${a.tags.join(', ')}]` : '';
      return `- ${a.id}: ${a.description}${tags}`;
    })
    .join('\n');

  const sections = [
    `Command: ${input.command}`,
    input.userArgs ? `Arguments: ${input.userArgs}` : null,
    input.focus ? `Focus bias: ${input.focus}` : null,
    `\nCodebase files (top ${FILE_TREE_LIMIT}):\n${input.fileTree.join('\n')}`,
    input.prdFrontmatter ? `\nPRD frontmatter:\n${input.prdFrontmatter}` : null,
    input.gitDiffSummary ? `\nUncommitted changes:\n${input.gitDiffSummary}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    'You are the Herald, an agent dispatch selector. Given the context below and the full agent registry, select which agents should be dispatched.',
    '',
    'Rules:',
    '- OVER-INCLUDE rather than under-include. A false positive costs one sub-agent launch. A false negative costs a missed finding.',
    '- Select agents whose expertise is relevant to the codebase content AND the command type.',
    '- If a --focus bias is provided, weight matching agents higher but do not exclude others that are relevant.',
    '- Typical roster size: 15-40 agents. Select fewer only if the codebase is genuinely narrow.',
    '- Output ONLY a JSON object with keys: roster (array of agent IDs), reasoning (string), estimatedAgents (number).',
    '',
    '--- CONTEXT ---',
    sections,
    '',
    '--- AGENT REGISTRY ---',
    agentList,
  ].join('\n');
}

function callHaiku(apiKey: string, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const req = httpsRequest(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: HERALD_TIMEOUT_MS,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Herald API returned ${res.statusCode}: ${body}`));
            return;
          }
          try {
            const parsed = JSON.parse(body) as { content?: Array<{ text?: string }> };
            const text = parsed.content?.[0]?.text ?? '';
            resolve(text);
          } catch {
            reject(new Error('Failed to parse Herald response'));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Herald request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

function parseHeraldResponse(text: string): HeraldResult {
  // Extract JSON from response — Haiku may wrap it in markdown fences
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in Herald response');

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

  const roster = Array.isArray(parsed.roster)
    ? (parsed.roster as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';
  const estimatedAgents = typeof parsed.estimatedAgents === 'number'
    ? parsed.estimatedAgents
    : (typeof parsed.estimated_agents === 'number' ? parsed.estimated_agents : roster.length);

  return { roster, reasoning, estimatedAgents };
}

export async function runHerald(
  input: HeraldInput,
  agents: AgentEntry[],
): Promise<HeraldResult> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return { roster: [], reasoning: 'No API key available', estimatedAgents: 0 };

  try {
    const prompt = buildPrompt(input, agents);
    const text = await callHaiku(apiKey, prompt);
    return parseHeraldResponse(text);
  } catch {
    // Graceful degradation — command falls back to hardcoded manifest
    return { roster: [], reasoning: 'Herald unavailable', estimatedAgents: 0 };
  }
}

// ── Context gatherer ────────────────────────────────────

export async function gatherHeraldContext(
  commandName: string,
  userArgs: string,
  focus?: string,
): Promise<HeraldInput> {
  const [fileTree, prdFrontmatter, gitDiffSummary] = await Promise.all([
    gatherFileTree(),
    gatherPrdFrontmatter(),
    gatherGitDiff(),
  ]);

  return { command: commandName, userArgs, focus, fileTree, prdFrontmatter, gitDiffSummary };
}

async function gatherFileTree(): Promise<string[]> {
  try {
    const { stdout } = await execCommand('find', [
      '.', '-type', 'f',
      '(', '-name', '*.ts', '-o', '-name', '*.tsx', '-o', '-name', '*.py',
      '-o', '-name', '*.js', '-o', '-name', '*.jsx', ')',
      '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
      '-not', '-path', '*/dist/*',
    ], { timeout: 5000 });
    return stdout.split('\n').filter(Boolean).slice(0, FILE_TREE_LIMIT);
  } catch {
    return [];
  }
}

async function gatherPrdFrontmatter(): Promise<string | undefined> {
  try {
    const content = await readFile('docs/PRD.md', 'utf-8');
    const lines = content.split('\n').slice(0, PRD_HEAD_LINES);
    return lines.join('\n');
  } catch {
    return undefined;
  }
}

async function gatherGitDiff(): Promise<string | undefined> {
  try {
    const { stdout } = await execCommand('git', ['diff', '--stat'], { timeout: 5000 });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
