/**
 * PRD asset scanner — identifies image/visual requirements from PRD prose.
 * Used by Celebrimbor's /imagine command to find what needs generating.
 * Pure text analysis — no API calls, no side effects.
 */

/** Patterns that indicate a visual asset requirement in PRD prose. */
const ASSET_PATTERNS: { pattern: RegExp; category: string }[] = [
  { pattern: /illustrat(?:ion|ed|e)/i, category: 'illustration' },
  { pattern: /portrait/i, category: 'portrait' },
  { pattern: /silhouette/i, category: 'portrait' },
  { pattern: /avatar/i, category: 'portrait' },
  { pattern: /(?:custom\s+)?\bicon\b/i, category: 'icon' },
  { pattern: /og[:\s-]image/i, category: 'og-image' },
  { pattern: /social\s+(?:sharing\s+)?image/i, category: 'og-image' },
  { pattern: /hero\s+(?:image|banner|art)/i, category: 'hero' },
  { pattern: /splash\s+(?:page|screen)/i, category: 'hero' },
  { pattern: /background\s+image/i, category: 'background' },
  { pattern: /cover\s+image/i, category: 'background' },
  { pattern: /\blogo\b/i, category: 'logo' },
  { pattern: /\bfavicon\b/i, category: 'icon' },
  { pattern: /comic\s+strip/i, category: 'illustration' },
  { pattern: /comic\s+panel/i, category: 'illustration' },
  { pattern: /screenshot/i, category: 'screenshot' },
  { pattern: /mockup/i, category: 'screenshot' },
];

/** Default dimensions per asset category. */
const CATEGORY_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'portrait': { width: 1024, height: 1024 },
  'illustration': { width: 1024, height: 1024 },
  'og-image': { width: 1200, height: 630 },
  'hero': { width: 1792, height: 1024 },
  'background': { width: 1792, height: 1024 },
  'logo': { width: 512, height: 512 },
  'icon': { width: 512, height: 512 },
  'screenshot': { width: 1280, height: 720 },
};

export interface AssetRequirement {
  description: string;
  category: string;
  context: string;
  width: number;
  height: number;
  section: string;
}

/**
 * Scan a PRD document for visual asset requirements.
 * Returns a list of assets that need generating.
 */
export function scanPrdForAssets(prdContent: string): AssetRequirement[] {
  const assets: AssetRequirement[] = [];
  const lines = prdContent.split('\n');
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track section headers
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim();
      continue;
    }

    // Check each line against asset patterns
    for (const { pattern, category } of ASSET_PATTERNS) {
      if (pattern.test(line)) {
        // Extract surrounding context (current line + next line for description)
        const contextLines = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3));
        const context = contextLines.join(' ').trim();
        const dims = CATEGORY_DIMENSIONS[category] || { width: 1024, height: 1024 };

        assets.push({
          description: line.trim(),
          category,
          context,
          width: dims.width,
          height: dims.height,
          section: currentSection,
        });
        break; // One match per line is enough
      }
    }
  }

  // Deduplicate by description similarity
  const seen = new Set<string>();
  return assets.filter(a => {
    const key = a.description.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract brand/style keywords from the PRD for style prefix generation.
 * Looks for Section 14 (Brand) or any section mentioning "brand", "style", "aesthetic".
 */
export function extractBrandStyle(prdContent: string): string[] {
  const keywords: string[] = [];
  const lines = prdContent.split('\n');
  let inBrandSection = false;

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      const title = headerMatch[1].toLowerCase();
      inBrandSection = title.includes('brand') || title.includes('style') || title.includes('aesthetic') || title.includes('design') || title.includes('personality');
      continue;
    }

    if (inBrandSection && line.trim()) {
      // Extract adjectives and style keywords
      const styleWords = line.match(/\b(minimal|bold|playful|professional|elegant|modern|retro|vintage|comic|pulp|neon|dark|light|cinematic|warm|cool|vibrant|muted|halftone|watercolor|photorealistic|illustration|flat|gradient|geometric|organic)\b/gi);
      if (styleWords) {
        keywords.push(...styleWords.map(w => w.toLowerCase()));
      }
    }
  }

  // Deduplicate
  return [...new Set(keywords)];
}
