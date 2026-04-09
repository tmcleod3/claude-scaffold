/**
 * Cloudflare DNS provisioning — zone lookup, record CRUD.
 * Uses the shared HTTP client. No external dependencies.
 */

import { httpsGet, httpsPost, httpsDelete, safeJsonParse } from '../provisioners/http-client.js';
import type { DnsRecord, ZoneInfo, DnsProvisionResult } from './types.js';
import type { ProvisionEmitter } from '../provisioners/types.js';
import { recordResourcePending, recordResourceCreated } from '../provision-manifest.js';

const CF_API = 'api.cloudflare.com';

function cfHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Extract the root zone from a hostname.
 * "app.voidforge.dev" → "voidforge.dev"
 * "voidforge.dev" → "voidforge.dev"
 */
export function extractZoneName(hostname: string): string {
  const parts = hostname.replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

/**
 * Find the Cloudflare zone for a hostname.
 * Accepts zones in any status (active, pending, etc.) — Cloudflare allows DNS
 * record creation on pending zones, which is needed after fresh domain registration
 * where zones start as pending until nameservers are verified (Kusanagi-5).
 */
export async function findZone(token: string, hostname: string): Promise<ZoneInfo | null> {
  const zoneName = extractZoneName(hostname);
  const res = await httpsGet(
    CF_API,
    `/client/v4/zones?name=${encodeURIComponent(zoneName)}`,
    cfHeaders(token),
  );

  if (res.status === 403) {
    throw new Error('Cloudflare token lacks Zone:Read permission. Create a token with Zone:DNS:Edit at dash.cloudflare.com/profile/api-tokens');
  }

  if (res.status !== 200) {
    throw new Error(`Cloudflare zones API returned ${res.status}`);
  }

  const data = safeJsonParse(res.body) as {
    success?: boolean;
    result?: { id: string; name: string; status: string }[];
  };

  if (!data?.success || !data.result || data.result.length === 0) {
    return null;
  }

  const zone = data.result[0];
  return { id: zone.id, name: zone.name, status: zone.status };
}

/** List existing DNS records for a hostname. */
export async function listRecords(token: string, zoneId: string, hostname: string): Promise<DnsRecord[]> {
  const res = await httpsGet(
    CF_API,
    `/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}&type=A,AAAA,CNAME`,
    cfHeaders(token),
  );

  if (res.status !== 200) return [];

  const data = safeJsonParse(res.body) as {
    result?: { id: string; type: string; name: string; content: string; proxied: boolean; ttl: number }[];
  };

  return (data?.result ?? []).map((r) => ({
    id: r.id,
    type: r.type as DnsRecord['type'],
    name: r.name,
    content: r.content,
    proxied: r.proxied,
    ttl: r.ttl,
  }));
}

/** Create a DNS record. */
export async function createRecord(
  token: string,
  zoneId: string,
  type: 'A' | 'CNAME',
  name: string,
  content: string,
  proxied: boolean,
): Promise<DnsRecord> {
  const body = JSON.stringify({ type, name, content, proxied, ttl: 1 }); // ttl=1 = auto
  const res = await httpsPost(
    CF_API,
    `/client/v4/zones/${zoneId}/dns_records`,
    cfHeaders(token),
    body,
  );

  if (res.status !== 200 && res.status !== 201) {
    const data = safeJsonParse(res.body) as { errors?: { message: string }[] };
    throw new Error(data?.errors?.[0]?.message || `DNS record creation returned ${res.status}`);
  }

  const data = safeJsonParse(res.body) as {
    result?: { id: string; type: string; name: string; content: string; proxied: boolean; ttl: number };
  };

  const r = data?.result;
  if (!r) throw new Error('No record returned from Cloudflare');

  return {
    id: r.id,
    type: r.type as DnsRecord['type'],
    name: r.name,
    content: r.content,
    proxied: r.proxied,
    ttl: r.ttl,
  };
}

/** Delete a DNS record. */
export async function deleteRecord(token: string, zoneId: string, recordId: string): Promise<void> {
  await httpsDelete(
    CF_API,
    `/client/v4/zones/${zoneId}/dns_records/${recordId}`,
    cfHeaders(token),
  );
}

/**
 * Determine the DNS record type and content based on deploy target outputs.
 *
 * VPS → A record pointing to EC2 public IP
 * Cloudflare Pages → CNAME pointing to slug.pages.dev
 * Static S3 → CNAME pointing to S3 website URL
 * Vercel → CNAME pointing to cname.vercel-dns.com
 * Railway → CNAME pointing to railway project URL
 */
function resolveRecordTarget(
  deployTarget: string,
  outputs: Record<string, string>,
): { type: 'A' | 'CNAME'; content: string; proxied: boolean } | null {
  switch (deployTarget) {
    case 'vps': {
      const ip = outputs['SSH_HOST'];
      if (!ip) return null;
      return { type: 'A', content: ip, proxied: true };
    }
    case 'cloudflare': {
      const url = outputs['CF_PROJECT_URL'];
      if (!url) return null;
      // Extract hostname from https://slug.pages.dev
      const host = url.replace(/^https?:\/\//, '');
      return { type: 'CNAME', content: host, proxied: true };
    }
    case 'static': {
      const url = outputs['S3_WEBSITE_URL'];
      if (!url) return null;
      const host = url.replace(/^https?:\/\//, '');
      return { type: 'CNAME', content: host, proxied: true };
    }
    case 'vercel': {
      return { type: 'CNAME', content: 'cname.vercel-dns.com', proxied: false };
    }
    case 'railway': {
      // Railway custom domains need a CNAME to the project's railway.app subdomain
      const projectName = outputs['RAILWAY_PROJECT_NAME'];
      const content = projectName
        ? `${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.up.railway.app`
        : 'railway.app';
      return { type: 'CNAME', content, proxied: false };
    }
    default:
      return null;
  }
}

/**
 * Full DNS provisioning flow — called as a post-provision step.
 * Non-fatal: returns success=false with error message, never throws.
 */
export async function provisionDns(
  runId: string,
  token: string,
  hostname: string,
  deployTarget: string,
  outputs: Record<string, string>,
  emit: ProvisionEmitter,
): Promise<DnsProvisionResult> {
  const records: DnsRecord[] = [];
  let zoneId = '';

  // Step 1: Find zone
  emit({ step: 'dns-zone', status: 'started', message: `Looking up Cloudflare zone for ${hostname}` });
  try {
    const zone = await findZone(token, hostname);
    if (!zone) {
      emit({ step: 'dns-zone', status: 'error', message: `Zone not found for "${extractZoneName(hostname)}". Add your domain at dash.cloudflare.com first.` });
      return { success: false, records, zoneId, error: 'Zone not found on Cloudflare' };
    }
    zoneId = zone.id;
    emit({ step: 'dns-zone', status: 'done', message: `Zone found: ${zone.name} (${zone.status})` });
  } catch (err) {
    emit({ step: 'dns-zone', status: 'error', message: 'Failed to look up DNS zone', detail: (err as Error).message });
    return { success: false, records, zoneId, error: (err as Error).message };
  }

  // Step 2: Determine record target
  const target = resolveRecordTarget(deployTarget, outputs);
  if (!target) {
    emit({ step: 'dns-records', status: 'error', message: `Cannot determine DNS target for deploy type "${deployTarget}". Infrastructure may still be provisioning.` });
    return { success: false, records, zoneId, error: 'No DNS target available' };
  }

  // Step 3: Check for existing records
  emit({ step: 'dns-records', status: 'started', message: `Creating ${target.type} record: ${hostname} → ${target.content}` });
  try {
    const existing = await listRecords(token, zoneId, hostname);
    if (existing.length > 0) {
      // Delete conflicting records before creating new ones
      for (const record of existing) {
        await deleteRecord(token, zoneId, record.id);
      }
      emit({ step: 'dns-cleanup', status: 'done', message: `Replaced ${existing.length} existing record(s) for ${hostname}` });
    }

    // Step 4: Create root record
    await recordResourcePending(runId, 'dns-record', hostname, 'global');
    const rootRecord = await createRecord(token, zoneId, target.type, hostname, target.content, target.proxied);
    records.push(rootRecord);
    await recordResourceCreated(runId, 'dns-record', `${zoneId}:${rootRecord.id}`, 'global');

    // Step 5: Create www record (if root domain)
    const parts = hostname.split('.');
    if (parts.length === 2) {
      const wwwHostname = `www.${hostname}`;
      const existingWww = await listRecords(token, zoneId, wwwHostname);
      for (const record of existingWww) {
        await deleteRecord(token, zoneId, record.id);
      }

      await recordResourcePending(runId, 'dns-record', wwwHostname, 'global');
      const wwwRecord = await createRecord(token, zoneId, 'CNAME', wwwHostname, hostname, target.proxied);
      records.push(wwwRecord);
      await recordResourceCreated(runId, 'dns-record', `${zoneId}:${wwwRecord.id}`, 'global');
    }

    const recordNames = records.map((r) => r.name).join(', ');
    emit({ step: 'dns-records', status: 'done', message: `DNS configured: ${recordNames} → ${target.content}` });
  } catch (err) {
    emit({ step: 'dns-records', status: 'error', message: 'Failed to create DNS records', detail: (err as Error).message });
    return { success: false, records, zoneId, error: (err as Error).message };
  }

  return { success: true, records, zoneId };
}

/**
 * Clean up DNS records created during provisioning.
 * Resource IDs are stored as "zoneId:recordId".
 */
export async function cleanupDnsRecords(
  token: string,
  resourceIds: string[],
): Promise<void> {
  for (const resourceId of resourceIds) {
    const [zoneId, recordId] = resourceId.split(':');
    if (zoneId && recordId) {
      try {
        await deleteRecord(token, zoneId, recordId);
      } catch (err) {
        console.error(`Failed to cleanup DNS record ${recordId}:`, (err as Error).message);
      }
    }
  }
}
