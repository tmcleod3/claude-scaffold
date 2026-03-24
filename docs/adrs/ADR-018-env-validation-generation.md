# ADR-018: Startup Environment Validation Script Generation

## Status: Accepted

## Context
After provisioning, the generated `.env` file may contain placeholder values (`# pending`, empty strings) for resources that were still provisioning (e.g., RDS endpoint). If the app boots without these values, it crashes with cryptic connection errors instead of a clear message.

## Decision
Generate a `validate-env.js` (or `validate-env.py` for Python) script in the project root. The script:
1. Reads `.env` file (or process.env)
2. Checks all required variables have non-empty, non-placeholder values
3. Reports missing/invalid vars with clear error messages
4. Exits with code 1 if validation fails

Generated during the env-writing phase in `provision.ts`. The script is framework-aware — Node projects get JS, Python projects get Python.

Lives in `wizard/lib/env-validator.ts`.

## Consequences
- Clear errors at boot time instead of cryptic runtime crashes
- Script is generated once — user can extend with custom validations
- Does not import any dependencies — pure stdlib
- Not enforced automatically (user must add to their startup sequence)
