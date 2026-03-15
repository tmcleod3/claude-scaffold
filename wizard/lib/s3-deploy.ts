/**
 * S3 deploy — upload build directory to S3 bucket via SDK.
 * No AWS CLI dependency (ADR-014). Uses @aws-sdk/client-s3 already in project.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import type { ProvisionEmitter } from './provisioners/types.js';

/** MIME type mapping for common static site file types. */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.xml': 'text/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.txt': 'text/plain',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Cache control: immutable for hashed assets, revalidate for HTML/SW. */
function getCacheControl(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.html' || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json') || filePath.endsWith('.webmanifest')) {
    return 'public, max-age=0, must-revalidate';
  }
  return 'public, max-age=31536000, immutable';
}

/** Recursively list all files in a directory. */
async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDir(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export interface S3DeployResult {
  success: boolean;
  deployUrl?: string;
  filesUploaded?: number;
  error?: string;
}

/**
 * Upload all files from a build directory to an S3 bucket.
 * Deletes stale files that no longer exist in the build directory.
 */
export async function s3Deploy(
  bucket: string,
  buildDir: string,
  region: string,
  credentials: { accessKeyId: string; secretAccessKey: string },
  websiteUrl: string,
  emit: ProvisionEmitter,
): Promise<S3DeployResult> {
  // Dynamic import of AWS SDK
  let S3Client: typeof import('@aws-sdk/client-s3').S3Client;
  let s3Commands: typeof import('@aws-sdk/client-s3');
  try {
    const s3Mod = await import('@aws-sdk/client-s3');
    S3Client = s3Mod.S3Client;
    s3Commands = s3Mod;
  } catch {
    emit({ step: 's3-deploy', status: 'error', message: 'AWS SDK not installed. Run: npm install @aws-sdk/client-s3' });
    return { success: false, error: 'AWS SDK not installed' };
  }

  const s3 = new S3Client({ region, credentials });

  // Step 1: Validate build directory exists
  emit({ step: 's3-deploy', status: 'started', message: `Uploading ${buildDir} to s3://${bucket}` });
  try {
    const dirStat = await stat(buildDir);
    if (!dirStat.isDirectory()) {
      emit({ step: 's3-deploy', status: 'error', message: `Build directory "${buildDir}" is not a directory` });
      return { success: false, error: 'Build directory is not a directory' };
    }
  } catch {
    emit({ step: 's3-deploy', status: 'error', message: `Build directory "${buildDir}" does not exist. Run your build command first (e.g., npm run build).` });
    return { success: false, error: 'Build directory does not exist' };
  }

  // Step 2: List local files
  const localFiles = await walkDir(buildDir);
  if (localFiles.length === 0) {
    emit({ step: 's3-deploy', status: 'error', message: `Build directory "${buildDir}" is empty` });
    return { success: false, error: 'Build directory is empty' };
  }

  // Step 3: Upload all files
  let uploaded = 0;
  const localKeys = new Set<string>();
  for (const filePath of localFiles) {
    const key = relative(buildDir, filePath).replace(/\\/g, '/'); // Windows compat
    localKeys.add(key);
    try {
      const body = await readFile(filePath);
      await s3.send(new s3Commands.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: getMimeType(filePath),
        CacheControl: getCacheControl(filePath),
      }));
      uploaded++;
    } catch (err) {
      emit({ step: 's3-deploy', status: 'error', message: `Failed to upload ${key}`, detail: (err as Error).message });
      return { success: false, error: `Upload failed for ${key}: ${(err as Error).message}` };
    }

    // Progress every 20 files
    if (uploaded % 20 === 0) {
      emit({ step: 's3-deploy', status: 'started', message: `Uploaded ${uploaded}/${localFiles.length} files...` });
    }
  }

  // Step 4: Delete stale files from S3
  emit({ step: 's3-cleanup', status: 'started', message: 'Removing stale files from S3' });
  try {
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const listRes = await s3.send(new s3Commands.ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }));
      const staleKeys = (listRes.Contents ?? [])
        .map(obj => obj.Key!)
        .filter(key => !localKeys.has(key));

      if (staleKeys.length > 0) {
        await s3.send(new s3Commands.DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: staleKeys.map(Key => ({ Key })) },
        }));
        deleted += staleKeys.length;
      }
      continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
    } while (continuationToken);

    if (deleted > 0) {
      emit({ step: 's3-cleanup', status: 'done', message: `Removed ${deleted} stale files` });
    } else {
      emit({ step: 's3-cleanup', status: 'done', message: 'No stale files to remove' });
    }
  } catch (err) {
    emit({ step: 's3-cleanup', status: 'error', message: 'Failed to clean stale files', detail: (err as Error).message });
    // Non-fatal — upload succeeded
  }

  emit({ step: 's3-deploy', status: 'done', message: `Uploaded ${uploaded} files to s3://${bucket}` });
  return { success: true, deployUrl: websiteUrl, filesUploaded: uploaded };
}
