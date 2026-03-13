# The Prophecy

*"Always in motion, the future is." -- Yoda*

*In the Jedi Archives, prophecies foretold the shape of things to come. Not certainties, but visions. Paths the Force revealed to those patient enough to listen.*

*This is VoidForge's prophecy. What the Council sees ahead.*

---

## v3.1 -- The Last Mile

The gap between "Strange provisioned your server" and "your app is live at your domain" is one DNS record. That's one record too many.

**DNS Management**
Kusanagi already has the keys. AWS credentials? In the vault. Cloudflare token? In the vault. Route53 and Cloudflare DNS APIs are waiting. Strange provisions the server, then points your domain at it. Caddy sees the domain, provisions SSL automatically. The user never opens a registrar dashboard.

Rex handles the tactical lockdown. Haku (the shapeshifter) handles DNS routing. Together they wire everything up before you finish your coffee.

**Domain Registration**
Why stop at DNS records? Route53 and Cloudflare Registrar both have APIs. Strange could ask "Buy this domain?" and register it on the spot. You don't even own the domain yet, and VoidForge handles the whole thing from purchase to production.

Senku builds civilization from scratch. This is that energy.

**Async Resource Polling**
RDS and ElastiCache take 5-10 minutes to spin up. Right now, Strange shrugs and says "check the AWS console." That's beneath us. Strange should poll the APIs, watch for the endpoints to come online, and auto-update `.env` when they're ready. Frieren is patient. She can wait. The user shouldn't have to.

---

## v3.2 -- The Pipeline

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

## v3.3 -- The Watchtower

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

## v3.4 -- The Academy

*"The only way to learn is to do." -- Picard, probably*

**Interactive Tutorial Mode**
A special PRD ships with VoidForge that builds a small demo app (task manager, link shortener, something simple). But instead of just building, each phase includes commentary explaining what just happened and why. "Picard chose a monolith here because..." "Stark put the business logic in a service because..."

You learn VoidForge by watching it work. Bilbo narrates. He's good at that.

**Pattern Playground**
A sandbox where you can see each of the 7 code patterns in action, with live examples across frameworks. Swap between Next.js, Express, Django, and Rails implementations. See how the same pattern adapts. Shuri innovates. Parker learns fast.

---

## v4 Territory -- The Multiverse

*"There was an idea... to bring together a group of remarkable people." -- Fury*

These are the big swings. The ones that change what VoidForge fundamentally is.

**Multi-Project Orchestration**
VoidForge managing a monorepo with multiple services, each with their own PRD. Picard designs the system boundaries. Stark builds the services independently. Kusanagi deploys them as a fleet with service mesh, shared databases, and coordinated rollbacks.

Lelouch orchestrates. He's a master strategist. He sees the whole board.

**Rollback Dashboard**
Strange grows a deployment history UI. See every deploy, every version, every rollback. One-click revert to any previous release. Deploy diffs showing exactly what changed. Trunks manages the timeline. Valkyrie handles the rescue operations.

**Cost Tracker**
AWS billing API integration, baked into Strange. "Your infrastructure costs $47/month. RDS is 60% of that. Here's what Picard's Tier 2 scaling plan would cost." Nanami tracks the budget. He's a 9-to-5 guy. He respects the numbers.

**Agent Memory**
Agents that remember across projects. "Last time you built a Next.js app with Stripe, we hit this issue in Phase 6." Holocrons storing not just methodology but experience. Wong guards the knowledge. The Sanctum grows.

---

## How This Works

The Prophecy is a living document. Visions sharpen as they approach.

- **Ideas start here** as rough sketches with character assignments
- **When work begins**, the idea graduates to a proper issue or ADR
- **When it ships**, it moves to the CHANGELOG and gets removed from here
- **Anyone can add a vision.** If you see something VoidForge should do, write it down. The Council will review.

---

*"Make it so." -- Picard*
