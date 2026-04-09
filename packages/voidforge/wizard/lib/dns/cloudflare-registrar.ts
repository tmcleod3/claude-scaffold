/**
 * Cloudflare Registrar — domain availability check and registration.
 * Uses the shared HTTP client. No external dependencies.
 */

import { httpsGet, httpsPost, safeJsonParse } from '../provisioners/http-client.js';
import type { ProvisionEmitter } from '../provisioners/types.js';

const CF_API = 'api.cloudflare.com';

/** Cloudflare account IDs are 32-character hex strings */
const ACCOUNT_ID_RE = /^[a-f0-9]{32}$/i;

/** Valid domain format: labels separated by dots, each 1-63 chars of alphanumeric/hyphens */
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function cfHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface DomainCheckResult {
  available: boolean;
  premium: boolean;
  price?: number;        // cents
  currency?: string;     // "USD"
  canRegister: boolean;
  error?: string;
}

export interface DomainRegistrationResult {
  success: boolean;
  domain?: string;
  expiresAt?: string;
  autoRenew?: boolean;
  error?: string;
}

/**
 * Check domain availability via Cloudflare Registrar API.
 * Returns availability status and price if registrable.
 */
export async function checkDomainAvailability(
  token: string,
  accountId: string,
  domain: string,
): Promise<DomainCheckResult> {
  if (!ACCOUNT_ID_RE.test(accountId)) {
    return { available: false, premium: false, canRegister: false, error: 'Invalid Cloudflare account ID format (expected 32-char hex)' };
  }
  if (!DOMAIN_RE.test(domain)) {
    return { available: false, premium: false, canRegister: false, error: 'Invalid domain format' };
  }

  const res = await httpsGet(
    CF_API,
    `/client/v4/accounts/${encodeURIComponent(accountId)}/registrar/domains?query=${encodeURIComponent(domain)}`,
    cfHeaders(token),
  );

  if (res.status === 403) {
    return { available: false, premium: false, canRegister: false, error: 'Token lacks Registrar:Read permission' };
  }

  if (res.status !== 200) {
    return { available: false, premium: false, canRegister: false, error: `Registrar API returned ${res.status}` };
  }

  const data = safeJsonParse(res.body) as {
    success?: boolean;
    result?: {
      domain?: string;
      available?: boolean;
      premium?: boolean;
      pricing?: { registration?: { price?: number; currency?: string } };
    }[];
    errors?: { message: string }[];
  };

  if (!data?.success || !data.result || data.result.length === 0) {
    // If no results, try the domain status endpoint directly
    const statusRes = await httpsGet(
      CF_API,
      `/client/v4/accounts/${encodeURIComponent(accountId)}/registrar/domains/${encodeURIComponent(domain)}`,
      cfHeaders(token),
    );

    if (statusRes.status === 404) {
      // Domain not registered with this account — may be available.
      // This is a best-guess: 404 means "not on THIS account", not "globally available."
      // canRegister: true is a "proceed to try" signal — the registration API will
      // correctly reject if the domain isn't actually available.
      return { available: true, premium: false, canRegister: true, error: 'Domain not found on this account — availability is unconfirmed until registration is attempted' };
    }

    if (statusRes.status === 200) {
      // Domain already registered with this account
      return { available: false, premium: false, canRegister: false, error: 'Domain already registered on this account' };
    }

    return { available: false, premium: false, canRegister: false, error: data?.errors?.[0]?.message || 'Could not check availability' };
  }

  const result = data.result[0];
  const price = result.pricing?.registration?.price;
  const currency = result.pricing?.registration?.currency;

  return {
    available: result.available ?? false,
    premium: result.premium ?? false,
    price,
    currency,
    canRegister: (result.available ?? false) && !(result.premium ?? false),
  };
}

/**
 * Register a domain via Cloudflare Registrar.
 * Auto-renew is enabled by default.
 * This is IRREVERSIBLE — domains cannot be deleted via API.
 */
export async function registerDomain(
  token: string,
  accountId: string,
  domain: string,
  emit: ProvisionEmitter,
): Promise<DomainRegistrationResult> {
  if (!ACCOUNT_ID_RE.test(accountId)) {
    return { success: false, error: 'Invalid Cloudflare account ID format (expected 32-char hex)' };
  }
  if (!DOMAIN_RE.test(domain)) {
    return { success: false, error: 'Invalid domain format' };
  }

  // Step 1: Check availability
  emit({ step: 'registrar-check', status: 'started', message: `Checking availability of ${domain}` });

  const check = await checkDomainAvailability(token, accountId, domain);

  if (!check.canRegister) {
    const reason = check.error || (check.premium ? 'Premium domain — manual registration required' : 'Domain is not available');
    emit({ step: 'registrar-check', status: 'error', message: reason });
    return { success: false, error: reason };
  }

  const priceDisplay = check.price ? ` ($${(check.price / 100).toFixed(2)} ${check.currency || 'USD'}/year)` : '';
  emit({ step: 'registrar-check', status: 'done', message: `${domain} is available${priceDisplay}` });

  // Step 2: Register the domain
  emit({ step: 'registrar-register', status: 'started', message: `Registering ${domain}...` });

  const body = JSON.stringify({
    name: domain,
    auto_renew: true,
  });

  // Use a longer timeout (60s) for domain registration — this is an irreversible
  // financial transaction. A 30-second timeout could mask a successful purchase.
  let res: { status: number; body: string };
  try {
    res = await httpsPost(
      CF_API,
      `/client/v4/accounts/${encodeURIComponent(accountId)}/registrar/domains/${encodeURIComponent(domain)}/register`,
      cfHeaders(token),
      body,
      60000,
    );
  } catch (regError) {
    // Registration call failed (timeout, network error, etc.).
    // Verify whether the domain was actually purchased before reporting failure.
    emit({ step: 'registrar-register', status: 'started', message: 'Registration request failed — verifying whether domain was purchased...' });
    const verifyCheck = await checkDomainAvailability(token, accountId, domain);
    if (!verifyCheck.available) {
      // Domain is no longer available — the purchase likely went through
      emit({ step: 'registrar-register', status: 'done', message: `Domain ${domain} registered (confirmed after transient error) — auto-renew enabled` });
      return { success: true, domain, autoRenew: true };
    }
    // Domain is still available — the purchase genuinely failed
    const errMsg = `Registration failed: ${(regError as Error).message}`;
    emit({ step: 'registrar-register', status: 'error', message: errMsg });
    return { success: false, error: errMsg };
  }

  if (res.status === 403) {
    const errMsg = 'Token lacks Registrar:Edit permission — update your Cloudflare API token';
    emit({ step: 'registrar-register', status: 'error', message: errMsg });
    return { success: false, error: errMsg };
  }

  if (res.status !== 200 && res.status !== 201) {
    // Non-success status — verify whether the domain was actually purchased despite the error
    const verifyCheck = await checkDomainAvailability(token, accountId, domain);
    if (!verifyCheck.available) {
      emit({ step: 'registrar-register', status: 'done', message: `Domain ${domain} registered (confirmed after API error) — auto-renew enabled` });
      return { success: true, domain, autoRenew: true };
    }
    const data = safeJsonParse(res.body) as { errors?: { message: string }[] };
    const errMsg = data?.errors?.[0]?.message || `Registration returned ${res.status}`;
    emit({ step: 'registrar-register', status: 'error', message: `Registration failed: ${errMsg}` });
    return { success: false, error: errMsg };
  }

  const data = safeJsonParse(res.body) as {
    success?: boolean;
    result?: {
      domain_name?: string;
      expires_at?: string;
      auto_renew?: boolean;
    };
    errors?: { message: string }[];
  };

  if (!data?.success) {
    const errMsg = data?.errors?.[0]?.message || 'Registration failed';
    emit({ step: 'registrar-register', status: 'error', message: errMsg });
    return { success: false, error: errMsg };
  }

  const registered = data.result;
  emit({
    step: 'registrar-register',
    status: 'done',
    message: `Domain ${domain} registered — auto-renew enabled`,
    detail: registered?.expires_at ? `Expires: ${registered.expires_at}` : undefined,
  });

  return {
    success: true,
    domain: registered?.domain_name || domain,
    expiresAt: registered?.expires_at,
    autoRenew: registered?.auto_renew ?? true,
  };
}
