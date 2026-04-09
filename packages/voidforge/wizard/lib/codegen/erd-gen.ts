/**
 * Database ERD generation from Prisma schema (ADR-025).
 * Parses prisma/schema.prisma and produces a Mermaid entity-relationship diagram.
 * Conditional — only runs if prisma/schema.prisma exists.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import type { ProvisionEmitter } from '../provisioners/types.js';

interface PrismaModel {
  name: string;
  fields: { name: string; type: string; isRelation: boolean; isOptional: boolean; isArray: boolean }[];
}

/**
 * Minimal Prisma schema parser — extracts model names and fields.
 * Not a full parser — handles the common cases for ERD generation.
 */
function parsePrismaSchema(content: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    const fields: PrismaModel['fields'] = [];

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\[\])?\s*(\?)?\s*/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        const isArray = !!fieldMatch[3];
        const isOptional = !!fieldMatch[4];

        // Skip Prisma directives like @id, @default, etc. — those are on the same line
        const builtinTypes = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'];
        const isRelation = !builtinTypes.includes(fieldType);

        fields.push({ name: fieldName, type: fieldType, isRelation, isOptional, isArray });
      }
    }

    models.push({ name, fields });
  }

  return models;
}

function generateMermaidERD(models: PrismaModel[]): string {
  const lines: string[] = [
    '```mermaid',
    'erDiagram',
  ];

  // Generate entity definitions
  for (const model of models) {
    lines.push(`    ${model.name} {`);
    for (const field of model.fields) {
      if (!field.isRelation) {
        const optional = field.isOptional ? '?' : '';
        lines.push(`        ${field.type}${optional} ${field.name}`);
      }
    }
    lines.push('    }');
  }

  // Generate relationships
  for (const model of models) {
    for (const field of model.fields) {
      if (field.isRelation) {
        const cardinality = field.isArray ? '}o--||' : '}o--o|';
        lines.push(`    ${model.name} ${cardinality} ${field.type} : "${field.name}"`);
      }
    }
  }

  lines.push('```');
  return lines.join('\n');
}

export interface ERDResult {
  success: boolean;
  file: string;
  modelCount: number;
  error?: string;
}

/**
 * Generate a Mermaid ERD from the Prisma schema.
 */
export async function generateERD(
  projectDir: string,
  emit: ProvisionEmitter,
): Promise<ERDResult> {
  const schemaPath = join(projectDir, 'prisma', 'schema.prisma');

  if (!existsSync(schemaPath)) {
    emit({ step: 'erd', status: 'skipped', message: 'No prisma/schema.prisma found — ERD generation skipped' });
    return { success: true, file: '', modelCount: 0 };
  }

  emit({ step: 'erd', status: 'started', message: 'Generating database ERD from Prisma schema' });

  try {
    const schema = await readFile(schemaPath, 'utf-8');
    const models = parsePrismaSchema(schema);

    if (models.length === 0) {
      emit({ step: 'erd', status: 'skipped', message: 'No models found in Prisma schema' });
      return { success: true, file: '', modelCount: 0 };
    }

    const mermaid = generateMermaidERD(models);
    const content = `# Database Schema\n\nAuto-generated from \`prisma/schema.prisma\` by VoidForge (ADR-025).\n\n${mermaid}\n`;

    const docsDir = join(projectDir, 'docs');
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, 'schema.md'), content, 'utf-8');

    emit({ step: 'erd', status: 'done', message: `Generated docs/schema.md — ${models.length} models mapped` });
    return { success: true, file: 'docs/schema.md', modelCount: models.length };
  } catch (err) {
    emit({ step: 'erd', status: 'error', message: 'Failed to generate ERD', detail: (err as Error).message });
    return { success: false, file: '', modelCount: 0, error: (err as Error).message };
  }
}
