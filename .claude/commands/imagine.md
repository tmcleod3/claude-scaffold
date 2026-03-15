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

## Step 5.5 — Optimize for Web (Gimli)

DALL-E outputs 1024x1024 PNGs regardless of display size. A 40px avatar served from a 1024px source wastes 99% of bandwidth. For every generated image:

1. **Determine display dimensions** — check the asset manifest for intended usage (avatar, hero, card, portrait). If the PRD or component specifies dimensions, use 2x those (retina). Default sizes by category: avatars → 200px, portraits → 400px, cards → 600px, hero → 1200px, OG images → 1200x630.
2. **Resize** — use `sharp` (already a project dependency) to resize to 2x display dimensions. Never serve 1024px for a 40px slot.
3. **Convert to WebP** — WebP is ~70% smaller than PNG at equivalent quality. Save as `.webp` with quality 85 (good enough for illustrations, dramatically smaller). Keep the original PNG in a `/originals` subfolder for regeneration.
4. **Verify size** — individual image must be < 200KB after optimization. If larger, reduce quality to 75 and try again.
5. **Update manifest** — record optimized filename, dimensions, and file size. Log savings: "Optimized {name}: {original_size} → {optimized_size} ({savings}% reduction)"

Total asset budget: all generated images combined should be < 10MB. If over, flag the largest offenders.

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
