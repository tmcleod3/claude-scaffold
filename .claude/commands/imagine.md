Celebrimbor lights the forge. Time to create.

## Context Setup
1. Read `/docs/methods/FORGE_ARTIST.md` for operating rules
2. Read the PRD — scan for visual asset requirements
3. Check vault for `openai-api-key`

## Step 0 — Credential Check

If no `openai-api-key` in vault:
1. Prompt the user: "Celebrimbor needs an OpenAI API key to generate images. Get one at platform.openai.com/api-keys"
2. Store in vault with same AES-256-GCM encryption as other credentials
3. Validate the key works (test API call)

If key exists, proceed silently.

## Step 1 — Scan the PRD (Nori)

Parse the PRD for visual asset requirements. Look for patterns:
- illustration, portrait, silhouette, avatar, icon (custom)
- OG image, og:image, hero image, background image
- logo, favicon, screenshot, comic strip, splash page

For each match, extract:
- **Description:** What the PRD says the image should look like
- **Context:** Which page/component/section it belongs to
- **Dimensions:** Infer from context (OG = 1200x630, portrait = 1024x1024, hero = 1792x1024)

If `$ARGUMENTS` contains `--scan`, stop here and report findings without generating.

## Step 2 — Scan Existing Assets (Nori)

Check `public/images/` (or equivalent asset directory) for what already exists.
Diff: what the PRD describes vs. what's on disk.
Produce an asset manifest showing status per image.

If `$ARGUMENTS` contains `--asset "name"`, filter to just that asset.

## Step 3 — Derive Style (Celebrimbor)

Read the PRD's brand section (Section 14 or equivalent) to derive the generation style:
- Color palette keywords
- Aesthetic direction (comic book, watercolor, minimalist, etc.)
- What to avoid (stock photo, generic, photorealistic unless specified)

Construct a **style prefix** that gets prepended to every generation prompt.

If `$ARGUMENTS` contains `--style "override"`, use that instead.

## Step 4 — Present the Plan

```
═══════════════════════════════════════════
  CELEBRIMBOR'S FORGE — Asset Plan
═══════════════════════════════════════════
  Style:   [derived style or override]
  Model:   [gpt-image-1 or --provider override]
  Assets:  [N] images to generate
  Est:     ~[time], ~$[cost]

  [list of assets with dimensions]

  Confirm? [Y/n]
═══════════════════════════════════════════
```

Wait for user confirmation.

## Step 5 — Generate (Ori)

For each asset:
1. Craft the generation prompt: style prefix + PRD description + dimension context
2. Call the image generation API
3. Download and save to `public/images/{category}/{name}.png`
4. Log to asset manifest (`public/images/manifest.json`)
5. Show progress: "Saved {name}.png ({n}/{total})"

- Sequential calls (rate limit aware)
- Retry failures up to 3 times
- Skip existing files unless `--regen` flag is set

If `$ARGUMENTS` contains `--regen "name"`, regenerate just that asset (overwrite existing).

## Step 6 — Integration Check (Dori)

Scan codebase for image references (`src=`, `url(`, `import`):
- Flag components that reference images that don't exist on disk
- Flag generated images that aren't referenced by any component
- Suggest wiring if images were generated but not integrated

## Step 7 — Report

```
═══════════════════════════════════════════
  CELEBRIMBOR'S FORGE — Complete
═══════════════════════════════════════════
  Generated: [n/total] images
  Retries:   [n] (if any)
  Total:     [size] MB
  Cost:      ~$[cost]
  Time:      [duration]

  Next: wire images into components
        (or run /build to integrate)
═══════════════════════════════════════════
```

## Arguments
- No arguments → full scan + generate all missing assets
- `--scan` → scan only, report what's needed without generating
- `--asset "name"` → generate a specific named asset
- `--regen "name"` → regenerate a specific image (overwrites existing)
- `--style "description"` → override the style derived from PRD
- `--provider model` → use specific model (default: gpt-image-1)
