# MCP INTEGRATION GUIDE
## System Protocol · Used by: All Agents
## Using Model Context Protocol Servers with the Scaffold

> *External tools expand what agents can do. This guide covers when and how to use them.*

## What MCP Servers Are

MCP (Model Context Protocol) servers provide Claude Code with access to external tools and services — databases, APIs, file systems, SaaS platforms — through a standardized interface. They extend what agents can do beyond code and local files.

## When to Use MCP Servers

| Scenario | MCP Server | Which Agent Uses It |
|----------|-----------|-------------------|
| Project management | Todoist, Linear, Jira | Picard (planning), Batman (bug tracking) |
| Documentation | Notion, Confluence | Picard (ADRs), Galadriel (design docs) |
| Communication | Slack | All (status updates, handoffs) |
| Design | Figma | Galadriel (design specs), Arwen (visual audit) |
| Monitoring | Datadog, Grafana | Kusanagi (L — monitoring), Stark (Fury — performance) |
| Version control | GitHub | All (PRs, issues, code review) |
| Database | PostgreSQL, Supabase | Stark (Banner — schema), Picard (Spock — data architecture) |
| AI/ML | Hugging Face | Stark (model selection), Picard (architecture) |

## Integration Patterns

### Pattern 1: Task Tracking

When the PRD is large, use a project management MCP to track build phases:

```
Phase 0 (Orient)     → Create project with sections matching build phases
Phase 1-8 (Build)    → Create tasks per feature, track completion
Phase 9-11 (Audit)   → Create issues per finding, link to code
Phase 12-13 (Deploy) → Launch checklist as task list
```

### Pattern 2: Communication

For team visibility during parallel agent work:

```
Agent starts phase    → Post status to project channel
Agent finds blocker   → Post to relevant agent's attention
Agent completes phase → Post summary with deliverables
Handoff between agents → Post handoff context
```

### Pattern 3: Documentation

For projects that need living documentation:

```
ADRs (Picard)           → Architecture decision page/doc
API docs (Stark)        → API reference page
UX audit (Galadriel)    → Issue tracker with screenshots
Security findings (Kenobi) → Security audit doc with severity tags
```

## Configuring MCP Servers

MCP servers are configured in Claude Code's settings. Each server provides specific tools that become available during sessions.

### Project-Level Configuration

Add MCP servers relevant to your project in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@mcp-server/package-name"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

### Common Server Configurations

**GitHub** — PRs, issues, code review:
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

**PostgreSQL** — Direct database access:
```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

## Security Rules (Kenobi Enforces)

1. **Never commit MCP API keys to git.** Use environment variable references.
2. **Use read-only access** where possible. Write access only when explicitly needed.
3. **Scope permissions narrowly.** Don't give a server access to all repos when it only needs one.
4. **Review what data MCP servers can access.** PII-containing databases need extra caution.
5. **Rotate keys** if a server is removed or compromised.

## Agent-MCP Mapping

When delegating work, agents should use MCP tools that match their domain:

| Agent | Primary MCP Tools | Use Case |
|-------|------------------|----------|
| **Picard** | GitHub (PRs/issues), Notion (docs) | Architecture decisions, planning |
| **Stark** | Database, GitHub (code) | Schema inspection, API implementation |
| **Galadriel** | Figma, Notion (design docs) | Design specs, component inventory |
| **Batman** | GitHub (issues), project management | Bug tracking, regression checklists |
| **Kenobi** | GitHub (security alerts) | Vulnerability scanning, audit trails |
| **Kusanagi** | Monitoring, cloud providers | Infrastructure management, deploy status |

## When NOT to Use MCP

- Don't use MCP for something the local filesystem handles fine
- Don't add MCP servers speculatively — add them when a specific need arises
- Don't use MCP to bypass local development (e.g., don't query prod DB when you should use a local copy)
- Don't configure MCP servers with overly broad permissions
