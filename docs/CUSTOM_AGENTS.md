# Custom Sub-Agents

> Project-specific specialists that carry domain knowledge. These run alongside built-in agents, not instead of them.

## How to Add a Custom Agent

1. Pick a base name from the Naming Registry that matches the domain's universe
2. Add a `-Specialty` suffix to avoid collisions (e.g., `Jarvis-Tailwind`, not `Jarvis`)
3. Define the agent below using the template
4. The agent will be loaded during Phase 0 Orient and participate in reviews for their lead's domain

## Template

```markdown
### [BaseName]-[Specialty]
**Universe:** [Universe] | **Reports to:** [Lead Agent]
**Domain:** [What this agent knows about]
**Behavioral directives:** [Specific rules this agent follows]
**Reference docs:** [External docs this agent should consult]
**Trigger:** [When this agent activates — e.g., "when the project uses Tailwind v4"]
```

## When to Create a Custom Agent

- The same lesson appears 3+ times in `docs/LESSONS.md` about the same technology
- A specific framework/library has patterns that the built-in agents miss repeatedly
- The project has a unique architectural pattern that needs dedicated review attention

## Built-In Conditional Agents

These activate automatically based on PRD frontmatter. You don't need to add them manually.

### Uhura-Mobile
**Universe:** Star Trek | **Reports to:** Picard
**Domain:** Mobile architecture: navigation stacks, deep linking, universal links, app lifecycle, platform-specific patterns
**Trigger:** `deploy: ios | android | cross-platform`

### Samwise-Mobile
**Universe:** Tolkien | **Reports to:** Galadriel
**Domain:** Mobile accessibility: VoiceOver (iOS), TalkBack (Android), Dynamic Type, reduced motion, touch targets (44pt/48dp minimum)
**Trigger:** `deploy: ios | android | cross-platform`

### Rex-Mobile
**Universe:** Star Wars | **Reports to:** Kenobi
**Domain:** Mobile security: certificate pinning, Keychain/Keystore, jailbreak/root detection, transport security (ATS/NSC), bundle secret scanning
**Trigger:** `deploy: ios | android | cross-platform`

## Custom Agents for This Project

*None yet. Add your first custom agent using the template above.*
