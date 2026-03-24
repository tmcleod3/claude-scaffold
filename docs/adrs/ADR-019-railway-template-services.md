# ADR-019: Railway Database via Template Services, Not Plugins

## Status: Accepted

## Context
Railway deprecated the `pluginCreate` GraphQL mutation. New Railway accounts cannot use it, causing silent failures when VoidForge tries to provision Postgres, MySQL, or Redis databases.

Railway's current API uses template services — databases are regular services created from template sources.

## Decision
Replace `pluginCreate` with Railway's `templateDeploy` mutation for database and Redis provisioning. The template deploy creates a new service in the project from a predefined database image.

For environment variable references, use Railway's `${{service.VAR}}` syntax to link the database service's connection URL to the application service.

## Consequences
- Database provisioning works on all Railway accounts (new and legacy)
- Template IDs may change — use Railway's public template registry names
- Connection string format changes from `${{Plugin.VAR}}` to `${{Postgres.DATABASE_URL}}` pattern
- Cleanup still uses `projectDelete` which removes all services (unchanged)
