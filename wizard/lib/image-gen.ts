/**
 * Image generation provider abstraction — Celebrimbor's forge tools.
 * Default: OpenAI (gpt-image-1). Extensible to other providers.
 * Uses the same vault system as other VoidForge credentials.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { httpsPost, httpsGet, safeJsonParse } from './provisioners/http-client.js';
import type { ProvisionEmitter } from './provisioners/types.js';

export interface ImageGenerationOptions {
  prompt: string;
  width: number;
  height: number;
  model?: string;
  quality?: 'low' | 'medium' | 'high';
}

export interface GeneratedAsset {
  name: string;
  filename: string;
  prompt: string;
  size: string;
  generatedAt: string;
  hash: string;
}

export interface AssetManifest {
  generated: string;
  model: string;
  style: string;
  assets: GeneratedAsset[];
}

// ── OpenAI Provider ──────────────────────────────────────

const OPENAI_API = 'api.openai.com';

/**
 * Generate an image via OpenAI's API.
 * Returns the raw image bytes as a Buffer.
 */
export async function generateImage(
  apiKey: string,
  options: ImageGenerationOptions,
  emit: ProvisionEmitter,
): Promise<Buffer | null> {
  const model = options.model || 'gpt-image-1';
  const size = `${options.width}x${options.height}`;

  // OpenAI only supports specific sizes — map to nearest and warn
  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  const actualSize = validSizes.includes(size) ? size : '1024x1024';
  if (actualSize !== size) {
    emit({ step: 'image-gen', status: 'started', message: `Requested ${size} → using ${actualSize} (API constraint)` });
  }

  const body = JSON.stringify({
    model,
    prompt: options.prompt,
    n: 1,
    size: actualSize,
    quality: options.quality || 'medium',
    response_format: 'b64_json',
  });

  try {
    const res = await httpsPost(OPENAI_API, '/v1/images/generations', {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }, body, 120_000); // 2 min timeout for image generation

    if (res.status !== 200) {
      const errData = safeJsonParse(res.body) as { error?: { message?: string } } | null;
      const errMsg = errData?.error?.message || `API returned ${res.status}`;
      emit({ step: 'image-gen', status: 'error', message: `Generation failed: ${errMsg}` });
      return null;
    }

    const data = safeJsonParse(res.body) as {
      data?: { b64_json?: string }[];
    } | null;

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      emit({ step: 'image-gen', status: 'error', message: 'No image data in API response' });
      return null;
    }

    return Buffer.from(b64, 'base64');
  } catch (err) {
    emit({ step: 'image-gen', status: 'error', message: 'Image generation request failed', detail: (err as Error).message });
    return null;
  }
}

/**
 * Validate an OpenAI API key by making a lightweight models list request.
 */
export async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const res = await httpsGet(OPENAI_API, '/v1/models', {
      'Authorization': `Bearer ${apiKey}`,
    }, 10_000);
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Estimate the cost of generating N images.
 */
export function estimateImageCost(count: number, model = 'gpt-image-1'): number {
  const costPerImage: Record<string, number> = {
    'gpt-image-1': 0.04,
    'dall-e-3': 0.08,
  };
  return count * (costPerImage[model] || 0.04);
}

// ── Asset Manifest ──────────────────────────────────────

const MANIFEST_FILENAME = 'manifest.json';

/**
 * Read the asset manifest from disk.
 */
export async function readManifest(imagesDir: string): Promise<AssetManifest | null> {
  const manifestPath = join(imagesDir, MANIFEST_FILENAME);
  try {
    const content = await readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as AssetManifest;
  } catch {
    return null;
  }
}

/**
 * Write the asset manifest to disk.
 */
export async function writeManifest(imagesDir: string, manifest: AssetManifest): Promise<void> {
  await mkdir(imagesDir, { recursive: true });
  await writeFile(join(imagesDir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * Save a generated image to disk and update the manifest.
 */
export async function saveGeneratedImage(
  imagesDir: string,
  category: string,
  name: string,
  imageBuffer: Buffer,
  prompt: string,
  size: string,
  manifest: AssetManifest,
): Promise<string> {
  const categoryDir = join(imagesDir, category);
  await mkdir(categoryDir, { recursive: true });

  const filename = `${category}/${name}.png`;
  const filepath = join(imagesDir, filename);
  await writeFile(filepath, imageBuffer);

  const hash = createHash('sha256').update(imageBuffer).digest('hex');

  // Remove any existing entry with the same filename (dedup for --regen)
  manifest.assets = manifest.assets.filter(a => a.filename !== filename);

  manifest.assets.push({
    name,
    filename,
    prompt,
    size,
    generatedAt: new Date().toISOString(),
    hash: `sha256:${hash}`,
  });

  await writeManifest(imagesDir, manifest);
  return filepath;
}

/**
 * Check if an asset already exists on disk.
 */
export function assetExists(imagesDir: string, category: string, name: string): boolean {
  return existsSync(join(imagesDir, category, `${name}.png`));
}
