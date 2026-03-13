# [PROJECT NAME] — Product Requirements Document

> Replace this file with your actual PRD. This template shows the structure that the build system expects.
> Not every section is required for every project — delete what doesn't apply.
> The more detailed your PRD, the better Claude Code will build from it.

---

## Frontmatter

Fill this out first. The Build Protocol reads these values to determine which phases apply and which can be skipped. Delete any line that doesn't apply to your project.

```yaml
# Project identity
name: "[PROJECT_NAME]"
type: "full-stack"  # full-stack | api-only | static-site | prototype

# Stack
framework: ""       # next.js | django | rails | express | etc.
database: ""        # postgres | mysql | sqlite | mongodb | none
cache: ""           # redis | none
styling: ""         # tailwind | css-modules | styled-components | etc.

# Feature flags — controls which build phases run
auth: yes           # yes | no — Phase 3
payments: none      # stripe | lemonsqueezy | none — Phase 6
workers: no         # yes | no — Phase 6 queue section
admin: no           # yes | no — Phase 7
marketing: no       # yes | no — Phase 8
email: none         # resend | sendgrid | ses | none — Phase 6

# Deployment
deploy: "vps"       # vps | vercel | railway | cloudflare | static | docker
instance_type: ""   # t3.micro | t3.small | t3.medium | t3.large — auto-recommended if blank (VPS only)
hostname: ""        # your-domain.com — Cloudflare DNS wiring (optional)
```

---

## 1. Product Vision

- **Name:**
- **One-liner:**
- **Domain:**
- **What it does:** (2-3 sentences)
- **Who it's for:**
- **Brand personality:** (e.g., "Confident, witty, warm. Never corporate.")

---

## 2. System Architecture

Describe the high-level architecture. Include a diagram if possible (ASCII is fine):

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Frontend    │───▶│  API        │───▶│  Database   │
└─────────────┘    └─────────────┘    └─────────────┘
```

### Route Structure

List every URL the application serves:

```
/                    → Description
/login               → Description
/dashboard           → Description
/api/...             → Description
```

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | | |
| Styling | | |
| Database | | |
| Auth | | |
| Payments | | |
| Email | | |
| Storage | | |
| Hosting | | |

---

## 4. Core Features

### Feature 1: [Name]

**User flow:**
1. User does X
2. System does Y
3. User sees Z

**Data model:**
- Entity fields and relationships

**API endpoints:**
- `POST /api/...` — Description

**UI:**
- What the screen looks like, what states exist (loading, empty, error, success)

### Feature 2: [Name]

(Repeat pattern)

---

## 5. Authentication & Accounts

- Auth methods (OAuth providers, email/password, magic link)
- User model fields
- Roles and permissions
- Session management

---

## 6. Database Schema

Full schema definition (Prisma, SQL, or whatever the stack uses).

---

## 7. API Design

All API routes with methods, inputs, outputs, and auth requirements.

---

## 8. Free vs Paid Tiers (if applicable)

| Feature | Free | Paid |
|---------|------|------|
| | | |

---

## 9. Payment Processing (if applicable)

- Provider (Stripe, etc.)
- Plans and pricing
- Webhook events to handle

---

## 10. Analytics & Tracking

- What events to track
- What metrics matter

---

## 11. Admin Dashboard (if applicable)

- What the team needs to see and do

---

## 12. Email & Notifications

| Email | Trigger | Content |
|-------|---------|---------|
| | | |

---

## 13. Security

- Encryption requirements
- Rate limiting rules
- Input validation approach
- Auth security (CSRF, session management)

---

## 14. Brand Voice & Personality

- How the product speaks (error messages, empty states, confirmations, buttons)
- Examples of good copy
- What to avoid

---

## 15. Deployment & Infrastructure

- Target hosting (EC2, Vercel, Railway, etc.)
- Process management
- DNS/SSL
- Backups
- Environment variables (complete list)

---

## 16. Launch Sequence

Phased build plan with milestones:

| Phase | Scope | Timeline |
|-------|-------|----------|
| 1. Foundation | | |
| 2. Core | | |
| 3. Polish | | |
| 4. Launch | | |
