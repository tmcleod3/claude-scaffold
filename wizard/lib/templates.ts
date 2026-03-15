/**
 * Project templates — curated starters with pre-filled PRD frontmatter,
 * recommended integrations, and seed configuration.
 *
 * Usage: `npx voidforge init --template saas`
 * Or selected in Merlin wizard Step 4 (PRD tab: "Start from a template")
 */

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  frontmatter: Record<string, string>;
  suggestedIntegrations: string[];
  prdSections: string;
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'saas',
    name: 'SaaS Application',
    description: 'Multi-tenant SaaS with auth, billing, teams, and admin dashboard. Next.js + Postgres + Stripe.',
    frontmatter: {
      type: 'full-stack',
      framework: 'next.js',
      database: 'postgres',
      cache: 'redis',
      styling: 'tailwind',
      auth: 'yes',
      payments: 'stripe',
      workers: 'yes',
      admin: 'yes',
      marketing: 'yes',
      email: 'resend',
      deploy: 'vps',
    },
    suggestedIntegrations: ['Stripe', 'Resend', 'S3'],
    prdSections: `## 1. Product Vision

**Name:** [PROJECT_NAME]
**One-liner:** [Describe your SaaS in one sentence]
**Who it's for:** [Target audience]

## 2. System Architecture

Multi-tenant SaaS with workspace isolation. Each tenant has their own data, billing, and team management.

## 3. Tech Stack

Next.js 14 (App Router), PostgreSQL, Redis, Tailwind + shadcn/ui, Prisma ORM, BullMQ workers.

## 4. Core Features

### 4.1 Authentication & Teams
- Email + password signup/login (or OAuth: Google, GitHub)
- Workspace creation on signup
- Team invites with role-based access (owner, admin, member)
- Session management with iron-session

### 4.2 [Your Core Feature]
[Describe the primary value proposition — the thing users pay for]

### 4.3 Billing
- Stripe Checkout for subscription creation
- Customer portal for plan management
- Webhook handling for subscription lifecycle (created, updated, cancelled, payment failed)
- Free trial: 14 days, no credit card required
- Plans: Free, Pro ($X/mo), Team ($X/mo)

### 4.4 Admin Dashboard
- User management (view, deactivate, change plan)
- Metrics: MRR, active subscriptions, churn rate
- Audit log of admin actions

## 5. Authentication & Accounts
[Detail auth flows, session management, OAuth providers]

## 6. Database Schema
[Prisma schema with User, Workspace, WorkspaceMember, Subscription tables]

## 7. API Design
[List all API routes with auth requirements]

## 15. Deployment
VPS with PostgreSQL, Redis, Caddy. PM2 cluster mode.`,
  },
  {
    id: 'api',
    name: 'REST API',
    description: 'Production API with auth, rate limiting, and documentation. Express + Postgres.',
    frontmatter: {
      type: 'api-only',
      framework: 'express',
      database: 'postgres',
      cache: 'redis',
      styling: 'none',
      auth: 'yes',
      payments: 'none',
      workers: 'no',
      admin: 'no',
      marketing: 'no',
      email: 'none',
      deploy: 'vps',
    },
    suggestedIntegrations: [],
    prdSections: `## 1. Product Vision

**Name:** [PROJECT_NAME]
**One-liner:** [What does this API do?]
**Who it's for:** [Frontend apps, mobile apps, third-party integrations]

## 3. Tech Stack

Express + TypeScript, PostgreSQL, Redis (caching + rate limiting), Prisma ORM.

## 4. Core Features

### 4.1 [Primary Resource]
[CRUD operations for the main entity]

### 4.2 Authentication
- API key auth for server-to-server
- JWT for user-facing clients
- Rate limiting per key/user

## 7. API Design
[List all endpoints with methods, auth, input/output schemas]

## 15. Deployment
VPS or Docker. Caddy reverse proxy. PM2 process management.`,
  },
  {
    id: 'marketing',
    name: 'Marketing Site',
    description: 'Fast, SEO-optimized marketing site with CMS-ready content. Next.js + Tailwind.',
    frontmatter: {
      type: 'static-site',
      framework: 'next.js',
      database: 'none',
      cache: 'none',
      styling: 'tailwind',
      auth: 'no',
      payments: 'none',
      workers: 'no',
      admin: 'no',
      marketing: 'yes',
      email: 'none',
      deploy: 'vercel',
    },
    suggestedIntegrations: [],
    prdSections: `## 1. Product Vision

**Name:** [PROJECT_NAME]
**One-liner:** [What does this site promote?]

## 4. Core Features

### Pages
- Homepage (hero, features, testimonials, CTA)
- Features / Product page
- Pricing page (if applicable)
- About page
- Blog (optional — MDX or CMS)
- Legal (privacy, terms)

### SEO
- Meta tags, Open Graph, JSON-LD
- Sitemap, robots.txt
- Performance: Lighthouse > 95

## 14. Brand Voice
[Tone, microcopy guidelines, visual style]

## 15. Deployment
Vercel (automatic from GitHub push).`,
  },
  {
    id: 'admin',
    name: 'Admin Dashboard',
    description: 'Internal tool with data tables, charts, and CRUD. Next.js + Postgres + shadcn/ui.',
    frontmatter: {
      type: 'full-stack',
      framework: 'next.js',
      database: 'postgres',
      cache: 'none',
      styling: 'tailwind',
      auth: 'yes',
      payments: 'none',
      workers: 'no',
      admin: 'yes',
      marketing: 'no',
      email: 'none',
      deploy: 'docker',
    },
    suggestedIntegrations: [],
    prdSections: `## 1. Product Vision

**Name:** [PROJECT_NAME]
**One-liner:** Internal admin dashboard for [what data/operations]
**Who it's for:** Internal team (not public-facing)

## 4. Core Features

### 4.1 Authentication
- Email + password login (internal users only)
- Role-based access: admin, viewer

### 4.2 Data Management
[List the entities this dashboard manages — users, orders, content, etc.]

### 4.3 Analytics
- Overview dashboard with key metrics
- Charts: line (trends), bar (comparisons), stat cards

## 6. Database Schema
[Prisma schema for the data this dashboard manages]

## 15. Deployment
Docker (internal network). Or VPS with Caddy + IP allowlist.`,
  },
];

/** Get a template by ID. Returns null if not found. */
export function getTemplate(id: string): ProjectTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/** List all available template IDs with descriptions. */
export function listTemplates(): { id: string; name: string; description: string }[] {
  return TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description }));
}
