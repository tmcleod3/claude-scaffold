Plant the thumper. Ride the worm. Command Claude Code from anywhere via Telegram.

## If `$ARGUMENTS` is `setup`:

Guide the user through Telegram bot setup conversationally — do NOT run the interactive `scan.sh` (it requires stdin which doesn't work in Claude Code).

### Step 1 — Get the bot token

Tell the user:

> To set up the Telegram bridge, you need a bot token from Telegram:
>
> 1. Open Telegram and search for **@BotFather**
> 2. Send `/newbot`
> 3. Choose a name (e.g., "VoidForge Bridge")
> 4. Choose a username ending in `bot` (e.g., `myforge_bot`)
> 5. BotFather will reply with a token — paste it here

Wait for the user to paste their bot token.

### Step 2 — Validate and detect chat ID

Once the user provides the token:

1. Validate it: `curl -s "https://api.telegram.org/bot<TOKEN>/getMe"` — check for `"ok":true`
2. Tell the user: "Token validated! Now **send any message to your bot** on Telegram (just type 'hello') and tell me when done."
3. When they confirm, detect the chat ID: `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates?limit=10"` — extract the first private chat ID
4. If no chat found, ask them to try again

### Step 3 — Run scan.sh non-interactive

Once you have both token and chat ID:

```bash
bash scripts/thumper/scan.sh --token "<TOKEN>" --chat-id "<CHAT_ID>"
```

Report the output. The sietch vault is sealed.

### Step 3.5 — Personalize the bot

After the sietch vault is sealed, personalize the bot using the Telegram Bot API. Read the project's `CLAUDE.md` to get the project name, and `docs/PRD.md` (or the root-level PRD) for the one-liner description.

**Set bot identity:**

```bash
# Bot display name — project-branded
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setMyName" \
  -d "name=VoidForge — <PROJECT_NAME>"

# Description (shown when user opens bot for the first time)
# Bilbo writes this: warm, confident, one sentence about the project + what the bridge does
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setMyDescription" \
  --data-urlencode "description=<BILBO_DESCRIPTION>"

# Short description (shown in bot search results and sharing)
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setMyShortDescription" \
  --data-urlencode "short_description=VoidForge bridge for <PROJECT_NAME>. Command your build from anywhere."
```

For the description, Bilbo should write something like: "Your direct line to [Project Name]'s forge. Send commands, check status, and build from anywhere. Powered by VoidForge — from nothing, everything."

**Register command menu:**

```bash
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{
    "commands": [
      {"command": "build", "description": "Execute the build protocol"},
      {"command": "campaign", "description": "Run the campaign (add --blitz or --fast)"},
      {"command": "qa", "description": "Batman'\''s QA pass"},
      {"command": "review", "description": "Picard'\''s code review"},
      {"command": "security", "description": "Kenobi'\''s security audit"},
      {"command": "ux", "description": "Galadriel'\''s UX/UI review"},
      {"command": "devops", "description": "Kusanagi'\''s infrastructure audit"},
      {"command": "architect", "description": "Picard'\''s architecture review"},
      {"command": "gauntlet", "description": "Thanos'\''s review (add --quick for 3 rounds)"},
      {"command": "test", "description": "Batman'\''s test-writing mode"},
      {"command": "debrief", "description": "Bashir'\''s post-mission analysis"},
      {"command": "git", "description": "Coulson'\''s version & release"},
      {"command": "void", "description": "Bombadil'\''s forge sync"},
      {"command": "imagine", "description": "Celebrimbor'\''s image generation"},
      {"command": "thumper", "description": "Thumper bridge control (on/off/status)"}
    ]
  }'
```

Verify the response shows `"ok":true` for each API call.

**Optional — Generate and set profile photo:**

If the vault has an `openai-api-key`, use `/imagine` to generate a project-themed avatar:
- Éowyn's prompt: "Minimalist icon representing [project name], [brand personality from PRD], dark background, clean lines, suitable as a small Telegram avatar, no text"
- Generate via OpenAI, save to `.voidforge/thumper/bot-avatar.png`
- Upload: `curl -s -F photo=@.voidforge/thumper/bot-avatar.png "https://api.telegram.org/bot<TOKEN>/setMyPhoto"`

If no OpenAI key, skip with a note: "Set a profile photo manually in @BotFather, or add an OpenAI API key to the vault and run `/thumper setup` again."

### Step 4 — Offer to start

Ask: "Thumper is configured and personalized. Want me to start the bridge now? (`/thumper on`)"

---

## For all other arguments (`on`, `off`, `status`, or no args):

Run the shell script directly:

```bash
bash scripts/thumper/thumper.sh $ARGUMENTS
```

Report the output exactly as returned.
