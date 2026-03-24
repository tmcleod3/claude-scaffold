# ADR-020: Credential Scoping for Provisioners

## Status: Accepted

## Context
The full vault contents are passed to every provisioner via `ctx.credentials`. A Vercel provisioner receives AWS keys, a Railway provisioner receives Cloudflare tokens, etc. This violates least-privilege. v3.8.0 scoped cleanup credentials but not provisioning credentials.

## Decision
Extend the existing `cleanupKeys` pattern in `provision.ts` to provisioning. Define a `provisionKeys` map that lists exactly which vault keys each provisioner needs. Filter credentials before constructing the `ProvisionContext`.

Internal keys (prefixed with `_`, e.g., `_github-owner`) are always passed through, as they're injected by pre-steps, not sourced from the vault.

```typescript
const provisionKeys: Record<string, string[]> = {
  vps: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
  static: ['aws-access-key-id', 'aws-secret-access-key', 'aws-region'],
  vercel: ['vercel-token'],
  railway: ['railway-token'],
  cloudflare: ['cloudflare-api-token', 'cloudflare-account-id'],
  docker: [],
};
```

## Consequences
- Each provisioner only sees keys it needs
- New provisioners must be added to both `provisionKeys` and `cleanupKeys`
- Internal `_`-prefixed keys bypass scoping (they're not vault secrets)
- Crash-recovery cleanup still loads full vault (acceptable — cleanup needs flexibility)
