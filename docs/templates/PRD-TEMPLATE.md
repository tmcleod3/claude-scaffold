# [Project Name] — Product Requirements Document

```yaml
# ── Required Fields ──────────────────────────────────
name: "my-project"

# ── Stack (all optional — Sisko proposes defaults) ───
type: "full-stack"           # full-stack | api-only | static-site | prototype
framework: "next"            # next | express | fastapi | django | rails | etc.
language: "typescript"       # typescript | javascript | python | go | rust
database: "postgresql"       # postgresql | mysql | sqlite | mongodb | none
cache: "redis"               # redis | memcached | none
styling: "tailwind"          # tailwind | css-modules | styled-components | none

# ── Features (yes | no | "provider-name") ────────────
auth: yes                    # yes | no | "clerk" | "nextauth" | "lucia"
payments: "stripe"           # no | "stripe" | "lemonsqueezy"
workers: yes                 # yes | no (enables PM2 config)
admin: yes                   # yes | no (enables admin panel)
marketing: no                # yes | no (enables Phase 8)
email: "resend"              # no | "resend" | "sendgrid"

# ── Deploy ───────────────────────────────────────────
deploy: "vps"                # vps | vercel | railway | cloudflare | static | docker
instance_type: "t3.small"    # t3.micro | t3.small | t3.medium | t3.large
hostname: "myapp.example.com"
```

## Overview

[One paragraph: What is this product? Who is it for? What problem does it solve?]

## Core Features

### [Feature 1]
[What it does, how the user interacts with it, acceptance criteria]

### [Feature 2]
[What it does, how the user interacts with it, acceptance criteria]

## Data Models

[Database schema: tables, relationships, key fields. If using an ORM like Prisma, show the schema.]

## API Routes

[List of endpoints: method, path, purpose, auth requirements]

## Pages / Views

[List of pages: path, what it shows, key interactions]

## Authentication

[Auth flow: signup, login, session management, roles/permissions if any]

## Deployment

[Deploy target, environment variables needed, CI/CD if applicable]

## Non-Functional Requirements

[Performance targets, accessibility requirements, SEO needs, security considerations]

---

**Usage:** Copy this template to `docs/PRD.md`, fill in your project details, then run:
- `/prd --import docs/PRD.md` to validate
- `/blueprint` to validate + provision + prepare for campaign
- `/campaign --blitz` to build autonomously
