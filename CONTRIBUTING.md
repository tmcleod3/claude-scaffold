# Contributing to VoidForge

Thanks for your interest in contributing to VoidForge. This guide explains how to get involved.

## Ways to Contribute

### Report Issues

Found a bug in the methodology? A command that doesn't work as documented? A pattern that leads to problems?

File a **field report** using `/debrief --submit` from within a VoidForge project, or [open an issue](https://github.com/tmcleod3/voidforge/issues/new) manually with the `field-report` label.

Good field reports include:
- What you were doing (which command, which project type)
- What went wrong (the specific gap, error, or unexpected behavior)
- What you expected to happen
- A proposed fix (which file should change and how)

### Improve Methodology

VoidForge's value is in its methodology — the method docs, patterns, and commands. Improvements that make the build protocol more reliable, the review agents more thorough, or the patterns more reusable are always welcome.

Before making changes:
1. Read `CLAUDE.md` for project conventions
2. Read the specific method doc you want to change
3. Check `docs/LESSONS.md` for existing learnings on the topic

### Add Patterns

New reference implementations in `docs/patterns/` are welcome if they:
- Solve a common problem across multiple project types
- Follow the existing pattern format (JSDoc header with key principles, agents, PRD reference)
- Include framework adaptations where applicable
- Don't add dependencies

### Fix Bugs

Runtime code lives in `wizard/` (main branch only). Fixes should:
- Follow TypeScript strict mode
- Use existing patterns (atomic writes, branded types, serialized queues)
- Include the finding ID if fixing a Gauntlet finding (e.g., "VG-003: ...")

## Branch Structure

| Branch | What's Here | Who Uses It |
|--------|-------------|-------------|
| `main` | Everything — methodology + wizard + CLI | All users (v21.0+) |

> **Note:** The `scaffold` and `core` branches were deprecated in v21.1 and will be deleted on 2026-05-08. All distribution now goes through npm: `npx voidforge-build init`.

**If your change is to a shared file** (commands, methods, patterns, CLAUDE.md, naming registry), it ships via the `voidforge-build-methodology` npm package.

**If your change is to runtime code** (`wizard/`), it ships via the `voidforge-build` npm package.

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Ensure shared files don't reference main-only paths
4. Describe what changed and why in the PR description
5. Reference any field report or issue number

## Code Style

- TypeScript strict mode, no `any`
- Small files (~300 lines max)
- Branded types for financial values (`Cents`, `Percentage`, `Ratio`)
- Atomic writes for mutable state files
- Zero new dependencies without justification

## The Agents

VoidForge's agents, characters, and personality are its identity. Contributions should respect the naming conventions in `docs/NAMING_REGISTRY.md` and the universe assignments. Don't rename agents or reassign universes without discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
