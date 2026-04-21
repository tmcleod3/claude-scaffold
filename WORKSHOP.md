# Building Web Apps with Claude Code + VoidForge
## A 45-Minute Workshop

> You don't need to know how to code. You need to know what you want to build.

---

## What You'll Build Today

By the end of this workshop, you'll have a working web application — designed, built, reviewed, and ready to deploy. Not a toy. A real app with a database, API, and UI.

We'll use **VoidForge** — a methodology framework that gives Claude Code a team of 190+ named AI agents, a structured build protocol, and quality gates. You describe what you want; the agents design, build, review, and harden it.

**Prerequisites:**
- A laptop with [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) installed
- A terminal (Terminal on Mac, PowerShell on Windows)
- An idea for something you want to build

**What you do NOT need:**
- Programming experience
- Framework knowledge
- A design background

---

## Part 0 — Setup (2 minutes)

First, create a folder for your project and install VoidForge:

```bash
npx voidforge-build init my-app
cd my-app
```

This gives you VoidForge's methodology — the slash commands, build protocols, code patterns, and agent definitions — plus the wizard UI. For methodology only (no wizard): `npx voidforge-build init --headless my-app`.

Now launch Claude Code inside your project:

```bash
claude
```

Claude Code automatically reads the `CLAUDE.md` file and picks up VoidForge's methodology. You now have access to 22 slash commands, 13 code patterns, and a team of named agents. You'll use four of them today.

---

## Part 1 — The Idea (5 minutes)

Now tell it what you want to build. One paragraph. Be specific about WHO it's for and WHAT problem it solves. Examples:

> "I want to build a meal planning app for busy parents. They pick dietary restrictions, number of people, and budget. The app generates a week of meals with a grocery list. They can swap meals they don't like."

> "I want a booking tool for my dog grooming business. Customers pick a service, see available times, and book. I see all bookings in a calendar view and can block off holidays."

> "I want a personal finance tracker. I enter expenses by category, set monthly budgets, and see charts of where my money goes. It warns me when I'm close to a budget limit."

**Your turn.** Write your paragraph. The more specific you are about the user and the problem, the better the result.

---

## Part 2 — The Blueprint (10 minutes)

Now you'll create a PRD (Product Requirements Document). This is the blueprint that VoidForge's build agents follow.

Type this in Claude Code:

```
/prd
```

This launches **Sisko** — VoidForge's campaign commander. He'll interview you in 5 acts:
1. **Vision** — What are you building and for whom?
2. **Features** — What can users do? (Claude suggests, you confirm)
3. **Tech stack** — What framework? (Claude recommends based on your app)
4. **Design** — What should it look like? (Colors, layout, feel)
5. **Launch** — How will you deploy it?

**Tips for beginners:**
- When Claude asks about tech stack, say: "Pick the best option for a beginner"
- When it asks about deployment, say: "Whatever's simplest"
- Say "yes" to suggestions you like, "no" to ones you don't, and "I don't know" when you're unsure — Claude will pick sensibly

At the end, you'll have a `docs/PRD.md` file. This is your app's blueprint.

**Take a moment to read it.** Does it describe what you want? Tell Claude to change anything that's wrong: "The PRD says 5 meal categories but I want 8" or "Remove the social sharing feature, I don't want that."

---

## Part 3 — The Build (15 minutes)

This is where the magic happens. Type:

```
/build
```

VoidForge's build protocol kicks in — **Picard** (architecture) designs the structure, **Stark** (backend) builds the API and database, **Galadriel** (frontend) builds the UI. The build runs 13 phases automatically:

1. **Orient** — Reads the PRD, extracts the tech stack, database schema, and routes
2. **Scaffold** — Creates the project structure (folders, config files, package.json)
3. **Database** — Sets up your database schema and seed data
4. **Core Feature** — Builds the most important user journey end-to-end
5. **Supporting Features** — Builds everything else the PRD describes
6. **Polish** — Error handling, loading states, mobile responsiveness

**What you'll see:** Claude writing files, creating components, setting up routes. You don't need to understand the code — you need to understand what it's doing. Claude will explain as it goes.

**What to do while it builds:**
- Watch for questions — Claude may ask "Should the budget be per week or per month?"
- If it pauses, read what it says and respond
- If something looks wrong, say so: "That's not what I meant by categories"

**If something breaks:** Don't panic. Say: "That didn't work, here's the error: [paste the error]." Claude will fix it.

---

## Part 4 — The Review (10 minutes)

Your app is built. Now let's make sure it works and looks right.

### See it running

Claude probably started a dev server. Look for a URL like `http://localhost:3000`. Open it in your browser. Click around. Try the main flow:

- Can you complete the primary task? (Book an appointment, add an expense, generate a meal plan)
- Does it look reasonable?
- Are there obvious broken things?

Tell Claude what you find: "The form submits but nothing shows up on the list" or "The calendar looks weird on my phone."

### Quick quality check

Type:

```
/review
```

**Picard** (architecture) and **Stark** (code quality) review the codebase — checking for bugs, security issues, pattern violations, and things the build missed. They'll fix what they find.

### Accessibility check

Type:

```
/ux
```

**Galadriel** and her full UX team check that your app is usable: **Samwise** tests keyboard navigation and screen readers, **Arwen** checks visual design and contrast, **Bilbo** audits the copy, **Radagast** hunts edge cases. They fix what they find.

---

## Part 5 — Ship It (5 minutes)

Your app works locally. Let's put it on the internet.

### Option A: The fast way (Vercel — free tier)

If your app is a Next.js or static site:

1. Create a free account at [vercel.com](https://vercel.com)
2. Tell Claude: "Deploy this to Vercel"
3. Follow the prompts

### Option B: The flexible way

Tell Claude: "What's the best way to deploy this?" It'll recommend based on your tech stack and give you step-by-step instructions.

### Option C: Skip for now

Totally fine. Your app runs locally. You can deploy later.

---

## What Just Happened

In 45 minutes, you:

1. **Described** what you wanted in plain English
2. **Refined** it into a structured blueprint (PRD)
3. **Built** a full-stack web application (database, API, UI)
4. **Reviewed** it for bugs, security, and usability
5. **Deployed** it (or prepared to)

You didn't write code. You directed a team of AI agents that write code. That's the skill: knowing what you want, being specific about it, and course-correcting when the result doesn't match.

**The VoidForge agents you used:**
- **Sisko** designed your PRD (the blueprint)
- **Picard** architected the structure
- **Stark** built the backend
- **Galadriel** built and reviewed the frontend
- **Samwise** checked accessibility
- **Kenobi** checked security (behind the scenes during `/build`)

---

## What To Do Next

### Make it better

```
Tell Claude: "I want to add [feature]"
```

Claude reads your existing code, understands the architecture, and adds the feature in the right place. For bigger additions, use `/campaign --plan add [feature]` to update your PRD first, then `/build` to implement.

### Fix something

```
Tell Claude: "When I [do X], [Y happens] but it should [Z]"
```

Be specific about what you did, what you saw, and what you expected.

### Run the full pipeline

For a bigger build with multiple features, use VoidForge's campaign system:

```
/campaign
```

**Sisko** reads your PRD, figures out the build order, and executes mission by mission. Each mission builds one feature, reviews it, and commits. At the end, **Thanos** runs the Gauntlet — a comprehensive review across all domains.

### Learn from what was built

```
Tell Claude: "Explain how the [booking/meal planning/budget] feature works"
```

Claude will walk you through the code in plain English. This is the fastest way to learn programming — reading code that does something you understand.

### Common next steps

| What you want | What to say |
|--------------|-------------|
| User accounts | "Add login and signup with email/password" |
| Payments | "Add Stripe checkout for [what you're selling]" |
| Email notifications | "Send an email when [event happens]" |
| Mobile app | "Make this a Progressive Web App" |
| Custom domain | "Set up a custom domain for this" |
| Better design | "Make the design more [modern/minimal/colorful/professional]" |
| Full QA pass | `/qa` — Batman's comprehensive quality audit |
| Security check | `/sentinel` (alias: `/security`) — Kenobi's OWASP security audit |
| Version + release | `/git` — Coulson handles versioning and changelog |

---

## Tips for Working with Claude Code

### Be specific, not technical

Instead of: "Add a REST endpoint"
Say: "When someone clicks 'Book Now', save their booking and show a confirmation"

### One thing at a time

Instead of: "Add payments, email notifications, and a mobile app"
Say: "Add payments" — then after that works: "Now add email notifications"

### Show, don't just tell

Instead of: "It's broken"
Say: "When I click Submit, I see this error: [screenshot or paste]"

### Trust the process

Claude Code will:
- Pick appropriate technologies (you don't need to choose)
- Follow best practices (you don't need to know them)
- Handle security basics (you don't need to worry about it)
- Write tests (you don't need to understand them)

Your job is to be the product person: "This is what I want. This is who it's for. This is what matters most."

---

## Glossary

If Claude mentions these, here's what they mean:

| Term | Plain English |
|------|--------------|
| **API** | The part of your app that handles data (saving, loading, updating) |
| **Component** | A reusable piece of your UI (a button, a form, a card) |
| **Database** | Where your app stores information permanently |
| **Deploy** | Putting your app on the internet so others can use it |
| **Endpoint** | A specific URL your app responds to (like `/api/bookings`) |
| **Framework** | A toolkit for building web apps (Next.js, Express, etc.) |
| **Frontend** | What users see and interact with (the UI) |
| **Backend** | What runs on the server (data processing, storage) |
| **Migration** | A change to your database structure |
| **Route** | A page in your app (like `/dashboard` or `/settings`) |
| **Schema** | The structure of your database (what tables, what columns) |
| **Seed data** | Fake data to test with (sample bookings, example users) |

---

## The VoidForge Commands You Can Explore

| Command | Agent | What it does |
|---------|-------|-------------|
| `/prd` | Sisko | Generates a PRD from an interview |
| `/build` | Picard + Stark + Galadriel | Builds the app phase by phase |
| `/engage` (alias: `/review`) | Picard + Stark | Code review for quality and patterns |
| `/ux` | Galadriel + full UX team | UX, accessibility, and visual review |
| `/qa` | Batman + QA specialists | Full QA: edge cases, error states, boundaries |
| `/sentinel` (alias: `/security`) | Kenobi + security specialists | OWASP security audit |
| `/campaign` | Sisko | Multi-mission build from PRD to ship |
| `/gauntlet` | Thanos + comprehensive review team | The ultimate 5-round review |
| `/git` | Coulson | Version bump, changelog, commit |
| `/test` | Batman | Write missing tests |
| `/devops` | Kusanagi | Infrastructure and deploy review |
| `/architect` | Picard | Architecture review and ADRs |

---

## Resources

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) — Anthropic's CLI for Claude
- [VoidForge Scaffold](https://github.com/tmcleod3/voidforge/tree/scaffold) — The methodology used in this workshop
- [VoidForge Holocron](https://github.com/tmcleod3/voidforge/blob/main/HOLOCRON.md) — The full user guide
- [Next.js Tutorial](https://nextjs.org/learn) — If you want to understand what Claude built
- [Vercel](https://vercel.com) — Free deployment for web apps

---

*Built with [VoidForge](https://github.com/tmcleod3/voidforge) v12.4 — from nothing, everything.*
