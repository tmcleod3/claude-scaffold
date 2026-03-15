# The Prophecy

*"Always in motion, the future is." -- Yoda*

*In the Jedi Archives, prophecies foretold the shape of things to come. Not certainties, but visions. Paths the Force revealed to those patient enough to listen.*

*This is VoidForge's prophecy. What the Council sees ahead.*

---

## v3.1 -- The Last Mile *(shipped)*

~~The gap between "Strange provisioned your server" and "your app is live at your domain" is one DNS record. That's one record too many.~~

**~~DNS Management~~** — *Shipped in v3.1.0*
Cloudflare DNS wiring now runs as a post-provision step after Strange provisions any target. A records for VPS (pointing at EC2 IP), CNAMEs for platforms (Vercel, Railway, Cloudflare Pages, S3). Caddy uses the hostname for automatic Let's Encrypt SSL. Haku routes. Rex locks down. The user never opens a DNS dashboard.

**~~Platform Domain Registration~~** — *Shipped in v3.1.0 (unforetold)*
Not originally in the prophecy, but the Council saw the need. Vercel, Railway, and Cloudflare Pages now register the custom domain on the platform side via their APIs. DNS alone wasn't enough — the platforms need to know too.

**~~EC2 Instance Sizing~~** — *Shipped in v3.1.0 (unforetold)*
PRD-driven instance type recommendation. The `instance_type` frontmatter field is auto-recommended from project scope (database, cache, workers, payments, framework). Strange shows the recommendation with cost estimates. RDS and ElastiCache sizes match automatically. ADR-005.

**~~Domain Registration~~** — *Shipped in v3.3.0*
Cloudflare Registrar API for buying domains through Strange. Pre-DNS step with confirmation gate, cost warning, and post-failure verification. "You don't even own the domain yet, and VoidForge handles the whole thing from purchase to production." Senku built civilization from scratch. This was that energy. ADR-010.

**~~Async Resource Polling~~** — *Shipped in v3.3.0*
RDS and ElastiCache endpoints now arrive automatically. Strange polls with AbortController integration, terminal failure detection, and jitter. Frieren waited patiently. The user no longer has to. ADR-009.

**~~Security Hardening~~** — *Shipped in v3.3.0 (unforetold)*
Four-team review (Galadriel, Batman, Kusanagi, Kenobi) produced 43 findings — all resolved. CSRF protection, DB_PASSWORD stripped from SSE, AWS error sanitization, `.env` chmod 600, concurrency lock, input validation at all layers, HTTP retry logic, partial success UI.

---

## v3.2 -- Bombadil's Forge Sync *(shipped)*

**~~`/void` Self-Update Command~~** — *Shipped in v3.2.0 (unforetold)*
Not originally in the prophecy. Tom Bombadil emerged from the old forest with a new idea: keep the forge sharp. `/void` fetches the latest VoidForge methodology from the scaffold branch, compares every shared file, shows a human-readable update plan, and sings the changes into place — preserving project-specific customizations. Works on all three tiers. ADR-008.

---

## v3.3 -- The Last Mile Complete *(shipped)*

**~~Async Resource Polling~~** — *Shipped in v3.3.0*
**~~Domain Registration~~** — *Shipped in v3.3.0*
**~~Security Hardening (43 findings)~~** — *Shipped in v3.3.0 (unforetold)*

The remaining v3.1 prophecy items plus a full four-team security review. See v3.1 above for details.

---

## v3.4 -- The Pipeline *(next)*

Deploying manually is fine for launch day. After that, you want a pipeline that deploys every time you push to main. Batman wants automated smoke tests. Kenobi wants secrets out of flat files. Everyone wins.

**CI/CD Generation**
Strange already knows your deploy target, your framework, and your deploy commands. Generate `.github/workflows/deploy.yml` that does exactly what `deploy.sh` does, but triggered on push. Friday handles the automation. Rogers keeps it disciplined.

For VPS targets: SSH deploy via GitHub Actions. For platform targets (Vercel, Railway, Cloudflare): their native Git integration, pre-configured.

**Preview Environments**
Vercel and Railway already spin up preview deploys per PR. For VPS targets, spin up a Docker container per branch. Batman runs smoke tests against the preview before anyone reviews the code. Red Hood tries to break it before it ever hits main.

Nightwing covers every angle. In every environment.

**Secrets Management**
Graduate from `.env` files. Leia has been asking for this since v1. Push secrets into GitHub Secrets, AWS Secrets Manager, or platform-native environment variables. The vault already encrypts locally. Now it syncs to where the secrets actually need to live.

No more "did you remember to set the env vars in production?" Leia remembers. Leia always remembers.

---

## v3.5 -- The Watchtower

*Oracle sees the whole system. But right now, she's reading logs on a terminal. Give her a proper command center.*

**Monitoring Bootstrap**
Vegeta has been waiting for this moment. Generate Prometheus + Grafana configs, or Datadog/New Relic integration stubs. Health check endpoints that actually check health (database connection, Redis ping, external API reachability). Alerting rules with sensible thresholds.

"It's over 9000!" becomes a real alert. CPU, memory, request latency, error rate. Vegeta monitors relentlessly. He does not sleep.

**Log Aggregation**
Structured JSON logs are only useful if they go somewhere. CloudWatch for AWS deployments. Logflare for Vercel and Cloudflare. Papertrail for Railway. Hughes handles logging and observability. He deserves a proper pipeline.

**Backup Automation**
Kusanagi generates cron-based `pg_dump` scripts with S3 upload, rotation policy, and retention rules. But that's table stakes. The real feature: automated restore verification. Riza provides precision backup and protection. Trunks handles the rollbacks (he's literally a time traveler).

Weekly test restores to a scratch database. If the restore fails, Zenitsu panics and alerts you. As he should.

---

## v3.6 -- The Academy

*"The only way to learn is to do." -- Picard, probably*

**Interactive Tutorial Mode**
A special PRD ships with VoidForge that builds a small demo app (task manager, link shortener, something simple). But instead of just building, each phase includes commentary explaining what just happened and why. "Picard chose a monolith here because..." "Stark put the business logic in a service because..."

You learn VoidForge by watching it work. Bilbo narrates. He's good at that.

**Pattern Playground**
A sandbox where you can see each of the 7 code patterns in action, with live examples across frameworks. Swap between Next.js, Express, Django, and Rails implementations. See how the same pattern adapts. Shuri innovates. Parker learns fast.

---

## v5.5–v7.0 Territory — Camelot

*"Merlin is building Camelot."*

These are not incremental features. This is the transformation of VoidForge from a development tool you use in a terminal into a **castle you live in**. The key insight: don't rebuild Claude Code via the API — embed the real thing in a browser terminal. You get actual Claude Code (full tools, 1M context, interactive conversation) inside xterm.js, connected via WebSocket to a server-side PTY. After Merlin creates the project, the UI transitions to Camelot: a persistent browser workspace where you build, deploy, SSH into production, push hotfixes, run reviews, and manage every project you've ever built — all from one browser tab. Never leave. Never open a separate terminal.

When Camelot runs on a remote server, you access it from any device — phone, iPad, hotel business center, a friend's laptop. The server IS your development machine, build server, and production host. One VPS to rule them all.

**v5.5 — Camelot Local** *(the foundation)*
Browser terminal via `node-pty` + xterm.js + WebSocket. Merlin transitions to embedded terminal after project creation. Single project per instance. Claude Code runs in the browser. SSH to production from the browser. Multiple terminal tabs (Claude Code, SSH, shell). Session persistence across page navigation.

Haku (Spirited Away — the river spirit, master of transformation) handles the WebSocket bridge. He moves between worlds seamlessly.

**v6.0 — Camelot Multi** *(the Great Hall)*
Multi-project dashboard. Project registry at `~/.voidforge/projects.json`. The Great Hall shows all projects: status, health, deploy URL, monthly cost, quick actions. Each project is a "room" — click in to get the full terminal workspace. Background health poller pings each project's health URL every 5 minutes. Shared vault: AWS, GitHub, Cloudflare credentials work across all projects without re-entry.

Lelouch (Code Geass — master strategist) sees the whole board from the Great Hall. He orchestrates across all projects.

**v6.5 — Camelot Remote** *(the drawbridge)*
Self-hosted mode. Deploy VoidForge itself to a VPS. Access via public URL behind 5-layer security: network (IP allowlist + rate limiting), authentication (username/password + TOTP 2FA), vault (separate encryption password that auto-locks), terminal sandboxing (non-root user, resource limits, session caps), audit trail (every action logged). Two-password architecture: login password ≠ vault password. If someone compromises the session, they still can't read credentials or deploy. SSH keys never reach the browser — the server acts as a jump host.

Kenobi designed the security. "The high ground is everything."

**v7.0 — The Round Table** *(the kingdom)*
Multi-user, multi-project, coordinated operations. Role-based access (admin/deployer/viewer). Per-project permissions. Linked services for monorepo awareness. Coordinated deploys across service boundaries. Rollback dashboard with one-click revert. Cost tracking across the fleet. Agent memory that learns across projects.

Lelouch orchestrates the fleet. Trunks manages the timeline (rollbacks). Nanami tracks the budget. Wong guards the accumulated knowledge. Valkyrie runs rescue operations when deploys go sideways.

The full Prophecy v4 vision — Multi-Project Orchestration, Rollback Dashboard, Cost Tracker, Agent Memory — all live inside Camelot's walls.

---

## How This Works

The Prophecy is a living document. Visions sharpen as they approach.

- **Ideas start here** as rough sketches with character assignments
- **When work begins**, the idea graduates to a proper issue or ADR
- **When it ships**, it moves to the CHANGELOG and gets removed from here
- **Anyone can add a vision.** If you see something VoidForge should do, write it down. The Council will review.

---

*"Make it so." -- Picard*
