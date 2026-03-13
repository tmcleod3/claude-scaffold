# ADR-007: "hostname" for DNS, "domain" for Business Domain

## Status: Accepted

## Context

The Merlin wizard has a "Domain" field (Step 3) that captures the *business domain* (SaaS, E-commerce, Developer Tools). We now need to capture the *DNS hostname* (voidforge.dev) for DNS provisioning. Both could be called "domain" which creates confusion.

## Decision

- **`domain`** = business domain (SaaS, E-commerce, etc.) — existing field, unchanged
- **`hostname`** = DNS hostname (voidforge.dev) — new field in Merlin Step 3, PRD frontmatter, and ProvisionContext

The DNS hostname field is named `hostname` everywhere: PRD frontmatter (`hostname: "voidforge.dev"`), ProvisionContext (`hostname: string`), UI labels ("Hostname"), and .env (`HOSTNAME=voidforge.dev`).

## Consequences

- **Clear separation:** No ambiguity between business domain and DNS hostname
- **Backward compatible:** Existing `domain` field unchanged
- **Consistent:** Same name across all layers (PRD, API, UI, provisioner)

## Alternatives

1. **Rename existing "domain" to "industry" or "category":** Rejected — breaking change for existing projects
2. **Use "custom_domain" for DNS:** Rejected — verbose; "hostname" is the standard network term
3. **Use "domain" for DNS and rename business domain:** Rejected — too many existing references
