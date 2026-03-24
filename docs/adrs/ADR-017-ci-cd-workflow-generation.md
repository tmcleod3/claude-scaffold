# ADR-017: GitHub Actions CI/CD Workflow Generation

## Status: Accepted

## Context
Users get auto-deploy on push via platform webhooks (ADR-015), but no test-on-PR or lint-on-push. Missing CI means broken code can merge and deploy automatically.

## Decision
Generate `.github/workflows/ci.yml` (test + lint on PR) and `.github/workflows/deploy.yml` (deploy on merge to main) during the GitHub pre-step, after the initial push. Framework-aware:
- Node: `npm test`, `npm run lint`
- Django: `pytest`, `flake8`
- Rails: `bundle exec rspec`, `bundle exec rubocop`

Lives in `wizard/lib/ci-generator.ts`. Called from `github.ts` after successful push. Workflows are committed and pushed in a second commit.

## Consequences
- Every project gets CI/CD from first push
- Workflows are generated once — user can customize after
- Deploy workflow is platform-specific (Vercel, Railway, Cloudflare each have their own deploy action pattern)
- Docker targets get build + push to registry workflow instead
