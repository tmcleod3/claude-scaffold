# PRD GENERATOR — From Idea to Production-Ready PRD

## Purpose

Use this prompt with Claude to generate a comprehensive PRD from a rough product idea. The output PRD can then be dropped into `/docs/PRD.md` and built by the team (Galadriel, Stark, Batman, Kenobi, Picard, Kusanagi) using the Build Protocol.

---

## Usage

Paste the prompt below into a Claude conversation, followed by your product idea (as rough as 1-3 sentences). Claude will generate a full PRD.

---

## The Prompt

```
You are a senior product manager and systems architect. Your task is to take a rough product idea and produce a comprehensive, buildable Product Requirements Document (PRD).

The PRD must be detailed enough that an AI coding agent can build the entire application from it without asking clarifying questions. Every section must be specific — no vague hand-waving.

Produce the following sections. Start with a YAML frontmatter block, then the full PRD:

## Frontmatter (REQUIRED — placed at top of document)
```yaml
name: "[project name]"
type: "full-stack"  # full-stack | api-only | static-site | prototype
framework: ""       # next.js | django | rails | express | etc.
database: ""        # postgres | mysql | sqlite | mongodb | none
cache: ""           # redis | none
styling: ""         # tailwind | css-modules | styled-components | etc.
auth: yes           # yes | no
payments: none      # stripe | lemonsqueezy | none
workers: no         # yes | no
admin: no           # yes | no
marketing: no       # yes | no
email: none         # resend | sendgrid | ses | none
deploy: "vps"       # vps | vercel | railway | cloudflare | static | docker
```

## 1. Product Vision
- Name (suggest 2-3 if none given, pick the best)
- One-liner (under 15 words)
- What it does (2-3 sentences, mechanistic — not marketing)
- Who it's for (specific customer profile)
- Brand personality (3 adjectives + what it's NOT)

## 2. System Architecture
- High-level architecture diagram (ASCII)
- Route structure (every URL)
- Service boundaries

## 3. Tech Stack
- Framework, styling, database, cache, auth, payments, email, storage, hosting
- Rationale for each choice
- All dependencies

## 4. Core Features
For each feature:
- User flow (numbered steps)
- Data model (entities, fields, relationships)
- API endpoints (method, path, input, output, auth)
- UI description (screens, states: loading/empty/error/success)
- Edge cases

## 5. Authentication & Accounts
- Auth methods
- User model (complete fields)
- Roles and permissions
- Session management
- Password manager compatibility requirements

## 6. Database Schema
- Complete schema (Prisma format preferred)
- All models, fields, types, relations, indexes, enums

## 7. API Design
- Every route with method, auth, input schema, output schema
- Error response format
- Rate limiting rules

## 8. Tiers & Pricing (if applicable)
- Feature comparison table
- Pricing
- What's gated and how enforcement works (client + server)

## 9. Payment Processing (if applicable)
- Provider and integration approach
- Webhook events to handle
- Subscription lifecycle

## 10. Analytics & Tracking
- Event taxonomy (every event with properties)
- Key metrics and funnels

## 11. Admin Dashboard (if applicable)
- What the team sees and can do
- Sections and data

## 12. Email & Notifications
- Every transactional email (trigger, subject, content summary)

## 13. Security
- Encryption (at rest, in transit)
- Rate limiting
- Input validation
- CORS, CSRF, XSS prevention
- File upload security
- Secret management

## 13.5 AI Architecture (conditional — if the product uses AI/LLM features)
Ask the user: "Does your product use AI or LLM features? If yes: What models? What do they do (classify, generate, route, orchestrate)? What happens when the AI is wrong?" Generate a PRD section:

## AI Architecture
- **Provider:** [anthropic / openai / local / multi]
- **Models:** [list with justification]
- **AI Features:** [classification, generation, tool-use, routing, orchestration]
- **Failure strategy:** [what happens when the AI fails]
- **Eval strategy:** [how you'll measure quality]

## 14. Brand Voice & Personality
- How the product speaks
- Example microcopy for: buttons, errors, empty states, confirmations, destructive actions
- What tone to avoid

## 15. Deployment & Infrastructure
- Target hosting with specific setup
- Process management
- DNS/SSL
- Backup strategy
- Complete environment variable list

## 16. Launch Sequence
- Phased build plan (what gets built in what order)
- Each phase has: scope, dependencies, and "done" criteria

RULES:
- Every number must be specific (not "many" or "several")
- Every feature must have all states defined (loading, empty, error, success)
- Every API endpoint must have input validation described
- The schema must be complete — no "add more fields as needed"
- Environment variables must be listed exhaustively
- If you must assume something, state the assumption explicitly

THE PRODUCT IDEA:
```

Then paste your idea below the prompt.

---

## Tips for Better PRDs

1. **More input = better output.** Even rough notes, competitor links, or sketches help.
2. **Name your customer.** "Seed-stage founders raising their first round" > "startups."
3. **Name your stack if you have preferences.** Otherwise the generator picks sensible defaults.
4. **Include pricing if you know it.** Revenue model shapes the architecture.
5. **Include examples of products you admire.** Helps calibrate the voice and UX direction.

---

## PRD Evolution Log

For complex projects that go through iterative `/architect --plan` refinement, add a PRD Evolution Log section at the bottom of the PRD:

```markdown
## PRD Evolution Log

| Date | Change | Reason |
|------|--------|--------|
| YYYY-MM-DD | Initial PRD generated | Sisko's interview |
| YYYY-MM-DD | Restructured phases: auth before payments | Dependency analysis (Picard) |
| YYYY-MM-DD | Added historical validation phase | Strategy requires data proof before infra |
```

This section is optional for simple PRDs but recommended for any PRD that undergoes 3+ revision commits before building begins. The log captures *why* the PRD evolved — the git diff shows *what* changed but not the architectural reasoning. (Field report #126)

## After Generating

1. Review the PRD — fix anything that feels wrong
2. Save it as `/docs/PRD.md` in your project
3. Open Claude Code
4. Say: "Build this project from the PRD"
5. The Build Protocol will deploy Picard, Stark, Galadriel, and the rest in sequence
