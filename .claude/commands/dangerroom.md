# /dangerroom — The Danger Room (Mission Control Dashboard)

> *"The Danger Room is where X-Men train. It's where your project gets forged."*

## What It Does

Starts the VoidForge wizard server and opens the Danger Room dashboard in your browser. The Danger Room shows real-time build ops, growth metrics, campaign status, treasury data, and heartbeat monitoring — all in one place.

## Usage

```
/dangerroom [install|start|status|stop]
```

## Modes

### `/dangerroom` or `/dangerroom start`

Start the wizard server and open the Danger Room:

1. Check if the wizard server is already running (check port 3141)
2. If not running: start with `node wizard/server.js` or `npx voidforge start`
3. Open `http://localhost:3141/danger-room` in the default browser
4. If Cultivation is installed: opens to `#growth` tab by default
5. **Remote server:** If running on EC2/VPS where port 3141 is not publicly exposed, guide the user to use an SSH tunnel: `ssh -i your-key.pem -L 3141:localhost:3141 user@host` — then open `http://localhost:3141/danger-room` in their local browser. (Field report #122)

### `/dangerroom install`

Alias for starting the wizard server. Ensures the server is running and the Danger Room is accessible. If the project uses the scaffold branch (no packages/voidforge/wizard/server.ts), report: "The Danger Room requires the main branch. Run `git checkout main` or install VoidForge with `npx voidforge init`."

### `/dangerroom status`

Also available as `--status` flag for consistency.

Check the current state:
- Is the wizard server running? (check port 3141)
- Which tabs are available? (Ops always; Growth/Campaigns/Treasury/Heartbeat/Deep Current if Cultivation installed)
- Is the heartbeat daemon running?
- Last known URL

### `/dangerroom stop`

Stop the wizard server if running.

## Tabs

| Tab | What It Shows | Available When |
|-----|--------------|----------------|
| **Ops** | Campaign timeline, phase pipeline, findings, experiments, PRD coverage, prophecy graph | Always |
| **Growth** | Revenue/spend/net KPIs, ROAS by platform, traffic sources, conversion funnel | Cultivation installed |
| **Campaigns** | Ad campaign table, A/B test groups, agent recommendations | Cultivation installed |
| **Treasury** | Financial summary, budget utilization, platform connections, reconciliation | Cultivation installed |
| **Heartbeat** | Daemon status, token health, scheduled jobs, anomaly alerts | Cultivation installed |
| **Deep Current** | Situation model, campaign proposals, prediction accuracy, autonomy status | Deep Current initialized |

## Global Elements

- **Freeze button** — visible across all tabs when Cultivation is installed. Emergency pause on all automated spending.
- **Agent ticker** — real-time feed of agent activity at the bottom of every tab.
- **Sidebar** — context gauge, version, deploy status, tests, cost (visible across all tabs).

## Prerequisites

- Node.js installed
- Port 3141 available (or set `VOIDFORGE_PORT` env var)
- The `packages/voidforge/wizard/server.ts` file must exist. If it does not (scaffold/core users):
  1. Offer: "The Danger Room requires the wizard server. Pull it from upstream? [Y/n]"
  2. On yes: `git fetch voidforge main 2>/dev/null || git remote add voidforge https://github.com/tmcleod3/voidforge.git && git fetch voidforge main` then `git checkout voidforge/main -- packages/voidforge/`
  3. Run `npm install` to install wizard dependencies
  4. Proceed with `/dangerroom start`
  5. On no: stop with "Run manually: `git checkout voidforge/main -- packages/voidforge/`"

## Arguments
$ARGUMENTS
