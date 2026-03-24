# ADR-016: Pre-Deploy Build Step Before Upload/Push

## Status: Accepted

## Context
Every deploy target assumes a build output directory exists (`dist/`, `.next/`, `build/`, etc.). If the user hasn't built, they get confusing errors after infrastructure is already provisioned. The build command and output directory vary by framework.

## Decision
Add a framework-aware build step that runs AFTER the provisioner completes but BEFORE any deploy action (SSH deploy, S3 upload, platform deploy polling). The build step:
1. Maps framework to build command (`npm run build`, `python manage.py collectstatic`, etc.)
2. Detects expected output directory
3. Runs the build via `exec.ts` (same pattern as `github.ts`)
4. Verifies output directory exists after build
5. Skips for Docker (Dockerfile handles its own build)

Lives in `wizard/lib/build-step.ts`. Called from `provision.ts` between provisioner completion and deploy post-steps.

## Consequences
- No more "dist/ not found" errors after infrastructure is provisioned
- Framework detection is best-effort — falls back to `npm run build` for unknown frameworks
- Build failures are fatal — no point deploying without build output
- Docker target skips this step (build happens inside container)
