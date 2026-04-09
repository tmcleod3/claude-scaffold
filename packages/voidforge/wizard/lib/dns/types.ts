/**
 * DNS provisioning types — shared across DNS providers.
 */

export interface DnsRecord {
  id: string;
  type: 'A' | 'AAAA' | 'CNAME';
  name: string;       // e.g. "voidforge.dev"
  content: string;    // e.g. "3.14.159.26" or "slug.pages.dev"
  proxied: boolean;
  ttl: number;
}

export interface ZoneInfo {
  id: string;
  name: string;       // e.g. "voidforge.dev"
  status: string;     // "active", "pending", etc.
}

export interface DnsProvisionResult {
  success: boolean;
  records: DnsRecord[];
  zoneId: string;
  error?: string;
}
