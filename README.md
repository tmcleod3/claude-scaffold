# VoidForge — Scaffold

From nothing, everything.

The VoidForge methodology without the wizard tooling. No npm dependencies. No TypeScript compilation. Just the build system, agent protocols, code patterns, and slash commands.

**Want the full version with wizards and cloud provisioners?** See the [`main` branch](https://github.com/tmcleod3/voidforge/tree/main).

---

## Setup

```bash
git clone --branch scaffold https://github.com/tmcleod3/voidforge.git my-app
cd my-app
# Write your PRD in docs/PRD.md
# Open in Claude Code
/build
```

---

## What's Included

| Category | Contents |
|----------|----------|
| **Root context** | `CLAUDE.md` — loaded every session |
| **User guide** | `HOLOCRON.md` — the complete guide |
| **Slash commands** (11) | `/build`, `/qa`, `/test`, `/security`, `/ux`, `/review`, `/devops`, `/architect`, `/git`, `/void`, `/thumper` |
| **Agent protocols** (17) | Build protocol, all 9 specialist methods, orchestration, testing, troubleshooting, context management, MCP, PRD generation |
| **Code patterns** (7) | API route, service, component, middleware, error handling, job queue, multi-tenant |
| **Agent roster** | 170+ named characters across 7 fictional universes |
| **Worm rider** | `/thumper` — Telegram bridge with Gom Jabbar auth (Dune lore) |
| **Build journal** | `logs/build-state.md` — persistent session recovery |
| **Project init** | `scripts/new-project.sh` — manual scaffolding script |

## What's NOT Included

- Merlin setup wizard / Strange deploy wizard
- Encrypted credential vault
- Cloud provisioners (Docker, AWS, Vercel, Railway, Cloudflare, S3)
- npm dependencies / TypeScript config

For those, use the [`main` branch](https://github.com/tmcleod3/voidforge/tree/main).

---

## The Team

| Agent | Name | Domain |
|-------|------|--------|
| Frontend & UX | **Galadriel** (Tolkien) | UI, UX, a11y, design system |
| Backend | **Stark** (Marvel) | API, DB, services, queues |
| QA | **Batman** (DC) | Bugs, testing, hardening |
| Security | **Kenobi** (Star Wars) | Auth, injection, secrets, data |
| Architecture | **Picard** (Star Trek) | Schema, scaling, ADRs |
| DevOps | **Kusanagi** (Anime) | Deploy, monitor, backup |
| Release | **Coulson** (Marvel) | Version, changelog, commit |
| Forge Sync | **Bombadil** (Tolkien) | VoidForge self-update from upstream |
| Worm Rider | **Chani** (Dune) | Telegram bridge, Gom Jabbar, sandworm relay |

---

Read the **[Holocron](HOLOCRON.md)** for the full guide. Read the **[Prophecy](PROPHECY.md)** for what's next.

## License

MIT
