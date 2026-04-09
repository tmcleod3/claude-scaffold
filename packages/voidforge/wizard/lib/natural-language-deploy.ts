/**
 * Natural Language Deploy — resolve prose deployment descriptions to YAML frontmatter.
 *
 * Parse: "I want a $20/month server with SSL and daily backups"
 * → { deploy: 'vps', instanceType: 't3.small', hostname: '', resilience: { backups: 'daily', ... } }
 *
 * Uses keyword matching and heuristics — no AI API call required.
 */

// ── Types ───────────────────────────────────────

export interface DeployConfig {
  deploy: 'vps' | 'vercel' | 'railway' | 'cloudflare' | 'static' | 'docker';
  instanceType: string;
  hostname: string;
  estimatedMonthlyCost: string;
  resilience: {
    multiEnv: boolean;
    previewDeploys: boolean;
    rollback: boolean;
    migrations: 'auto' | 'manual' | 'no';
    backups: 'daily' | 'weekly' | 'no';
    healthCheck: boolean;
    gracefulShutdown: boolean;
    errorBoundaries: boolean;
    rateLimiting: boolean;
    deadLetterQueue: boolean;
  };
  reasoning: string[];
}

// ── Budget → Instance mapping ───────────────────

interface BudgetTier {
  maxMonthly: number;
  instanceType: string;
  label: string;
}

const BUDGET_TIERS: BudgetTier[] = [
  { maxMonthly: 10, instanceType: 't3.micro', label: '~$8/mo' },
  { maxMonthly: 25, instanceType: 't3.small', label: '~$17/mo' },
  { maxMonthly: 50, instanceType: 't3.medium', label: '~$34/mo' },
  { maxMonthly: 100, instanceType: 't3.large', label: '~$68/mo' },
  { maxMonthly: Infinity, instanceType: 't3.xlarge', label: '~$136/mo' },
];

function resolveInstanceFromBudget(budget: number): BudgetTier {
  return BUDGET_TIERS.find(t => budget <= t.maxMonthly) ?? BUDGET_TIERS[BUDGET_TIERS.length - 1];
}

// ── Keyword patterns ────────────────────────────

const PLATFORM_KEYWORDS: Array<{ pattern: RegExp; target: DeployConfig['deploy']; reason: string }> = [
  { pattern: /\bvercel\b/i, target: 'vercel', reason: 'Vercel mentioned explicitly' },
  { pattern: /\brailway\b/i, target: 'railway', reason: 'Railway mentioned explicitly' },
  { pattern: /\bcloudflare\b/i, target: 'cloudflare', reason: 'Cloudflare mentioned explicitly' },
  { pattern: /\bdocker\b|\bcontainer\b/i, target: 'docker', reason: 'Docker/container mentioned' },
  { pattern: /\bstatic\s*(?:site|hosting|files?)\b/i, target: 'static', reason: 'Static site hosting' },
  { pattern: /\bvps\b|\bserver\b|\bec2\b|\baws\b|\bssh\b/i, target: 'vps', reason: 'Server/VPS/AWS mentioned' },
  { pattern: /\bserverless\b|\bedge\b/i, target: 'vercel', reason: 'Serverless/edge → Vercel' },
  { pattern: /\bfree\s*tier\b|\bno\s*cost\b|\bfree\b/i, target: 'railway', reason: 'Free tier → Railway' },
];

const FEATURE_KEYWORDS: Array<{ pattern: RegExp; key: string; reason: string }> = [
  { pattern: /\bbackup/i, key: 'backups', reason: 'Backups requested' },
  { pattern: /\bssl\b|\bhttps\b|\btls\b/i, key: 'ssl', reason: 'SSL/TLS requested' },
  { pattern: /\bcustom\s*domain\b|\bmy\s*domain\b/i, key: 'customDomain', reason: 'Custom domain' },
  { pattern: /\brollback\b|\brevert\b/i, key: 'rollback', reason: 'Rollback requested' },
  { pattern: /\bpreview\b|\bpr\s*deploy/i, key: 'previewDeploys', reason: 'Preview deploys' },
  { pattern: /\bhealth\s*check\b|\bmonitoring\b|\buptime\b/i, key: 'healthCheck', reason: 'Health monitoring' },
  { pattern: /\brate\s*limit/i, key: 'rateLimiting', reason: 'Rate limiting' },
  { pattern: /\bgraceful\b|\bzero\s*downtime\b/i, key: 'gracefulShutdown', reason: 'Zero-downtime' },
  { pattern: /\bmulti\s*(?:env|environment)\b|\bstaging\b/i, key: 'multiEnv', reason: 'Multi-environment' },
  { pattern: /\berror\s*boundar/i, key: 'errorBoundaries', reason: 'Error boundaries' },
  { pattern: /\bdead\s*letter\b|\bdlq\b|\bretry\s*queue\b/i, key: 'deadLetterQueue', reason: 'Dead letter queue' },
  { pattern: /\bmigration/i, key: 'migrations', reason: 'Database migrations' },
];

const SCALE_KEYWORDS: Array<{ pattern: RegExp; scale: 'small' | 'medium' | 'large'; reason: string }> = [
  { pattern: /\bsmall\b|\bsimple\b|\bblog\b|\bpersonal\b|\bside\s*project\b|\bmvp\b|\bprototype\b/i, scale: 'small', reason: 'Small/simple project' },
  { pattern: /\bmedium\b|\bstartup\b|\bsaas\b|\bteam\b|\bgrow/i, scale: 'medium', reason: 'Medium/startup scale' },
  { pattern: /\blarge\b|\benterprise\b|\bthousands\b|\bhigh\s*traffic\b|\bscale\b|\bproduction\b/i, scale: 'large', reason: 'Large/production scale' },
];

// ── Main resolver ───────────────────────────────

export function resolveDeployConfig(prose: string): DeployConfig | null {
  if (!prose.trim()) return null;

  const reasoning: string[] = [];
  const features = new Set<string>();

  // Extract budget — prefer amounts near cost keywords, fall back to first $N
  const costContextMatch = prose.match(/(?:budget|spend|cost|month|mo)[^$]*\$(\d+(?:\.\d+)?)/i)
    ?? prose.match(/\$(\d+(?:\.\d+)?)(?:\s*\/\s*mo(?:nth)?)/i)
    ?? prose.match(/\$(\d+(?:\.\d+)?)/i);
  const budget = costContextMatch ? Math.round(parseFloat(costContextMatch[1])) : -1;

  // Detect explicit platform
  let deploy: DeployConfig['deploy'] = 'vps'; // default
  let platformDetected = false;
  for (const kw of PLATFORM_KEYWORDS) {
    if (kw.pattern.test(prose)) {
      deploy = kw.target;
      reasoning.push(kw.reason);
      platformDetected = true;
      break;
    }
  }

  // Detect features
  for (const kw of FEATURE_KEYWORDS) {
    if (kw.pattern.test(prose)) {
      features.add(kw.key);
      reasoning.push(kw.reason);
    }
  }

  // Detect scale
  let scale: 'small' | 'medium' | 'large' = 'small';
  for (const kw of SCALE_KEYWORDS) {
    if (kw.pattern.test(prose)) {
      scale = kw.scale;
      reasoning.push(kw.reason);
      break;
    }
  }

  // If no platform detected, infer from features and scale
  if (!platformDetected) {
    if (features.has('previewDeploys') || features.has('errorBoundaries')) {
      deploy = 'vercel';
      reasoning.push('Preview deploys/error boundaries → Vercel (best support)');
    } else if (scale === 'large' || features.has('customDomain') || budget > 30) {
      deploy = 'vps';
      reasoning.push('Large scale or custom domain with budget → VPS');
    } else if (scale === 'small' && budget < 0) {
      deploy = 'railway';
      reasoning.push('Small project, no budget specified → Railway (easiest start)');
    } else {
      deploy = 'vps';
      reasoning.push('Default → VPS (most flexible)');
    }
  }

  // Resolve instance type from budget or scale
  let instanceType = '';
  let estimatedCost = '';
  if (deploy === 'vps') {
    if (budget >= 0) {
      const tier = resolveInstanceFromBudget(budget);
      instanceType = tier.instanceType;
      estimatedCost = tier.label;
      reasoning.push(`Budget $${budget}/mo → ${tier.instanceType} (${tier.label})`);
    } else {
      const scaleMap = { small: 't3.micro', medium: 't3.small', large: 't3.medium' };
      const costMap = { small: '~$8/mo', medium: '~$17/mo', large: '~$34/mo' };
      instanceType = scaleMap[scale];
      estimatedCost = costMap[scale];
      reasoning.push(`${scale} scale → ${instanceType} (${estimatedCost})`);
    }
  } else {
    estimatedCost = deploy === 'railway' ? 'Free tier available' :
      deploy === 'vercel' ? 'Free tier available' :
      deploy === 'cloudflare' ? 'Free tier available' :
      deploy === 'static' ? 'Minimal (~$1/mo S3)' : 'Varies';
  }

  // Extract hostname if mentioned
  const hostnameMatch = prose.match(/(?:domain|hostname|url)[\s:]*([a-z0-9.-]+\.[a-z]{2,})/i);
  const hostname = hostnameMatch ? hostnameMatch[1] : '';
  if (hostname) reasoning.push(`Hostname detected: ${hostname}`);

  // Build resilience config — defaults based on deploy target + detected features
  const isVps = deploy === 'vps';
  const isPlatform = ['vercel', 'railway', 'cloudflare'].includes(deploy);

  const resilience: DeployConfig['resilience'] = {
    multiEnv: features.has('multiEnv') || scale !== 'small',
    previewDeploys: features.has('previewDeploys') || (isPlatform && scale !== 'small'),
    rollback: features.has('rollback') || isPlatform,
    migrations: features.has('migrations') ? 'auto' : (isVps ? 'manual' : 'no'),
    backups: features.has('backups') ? 'daily' : (isVps && scale !== 'small' ? 'weekly' : 'no'),
    healthCheck: features.has('healthCheck') || isVps || scale !== 'small',
    gracefulShutdown: features.has('gracefulShutdown') || isVps,
    errorBoundaries: features.has('errorBoundaries'),
    rateLimiting: features.has('rateLimiting') || scale === 'large',
    deadLetterQueue: features.has('deadLetterQueue'),
  };

  return {
    deploy,
    instanceType,
    hostname,
    estimatedMonthlyCost: estimatedCost,
    resilience,
    reasoning,
  };
}

/** Sanitize a string for safe YAML double-quoted interpolation. */
function yamlSafe(value: string): string {
  return value.replace(/[\\"]/g, '');
}

/** Convert a DeployConfig to YAML frontmatter fragment. */
export function toFrontmatter(config: DeployConfig): string {
  const lines: string[] = [
    `deploy: "${yamlSafe(config.deploy)}"`,
  ];

  if (config.instanceType) {
    lines.push(`instance_type: "${yamlSafe(config.instanceType)}"`);
  }
  if (config.hostname) {
    lines.push(`hostname: "${yamlSafe(config.hostname.toLowerCase())}"`);
  }

  lines.push('resilience:');
  lines.push(`  multi-env: ${config.resilience.multiEnv ? 'yes' : 'no'}`);
  lines.push(`  preview-deploys: ${config.resilience.previewDeploys ? 'yes' : 'no'}`);
  lines.push(`  rollback: ${config.resilience.rollback ? 'yes' : 'no'}`);
  lines.push(`  migrations: "${yamlSafe(config.resilience.migrations)}"`);
  lines.push(`  backups: "${yamlSafe(config.resilience.backups)}"`);
  lines.push(`  health-check: ${config.resilience.healthCheck ? 'yes' : 'no'}`);
  lines.push(`  graceful-shutdown: ${config.resilience.gracefulShutdown ? 'yes' : 'no'}`);
  lines.push(`  error-boundaries: ${config.resilience.errorBoundaries ? 'yes' : 'no'}`);
  lines.push(`  rate-limiting: ${config.resilience.rateLimiting ? 'yes' : 'no'}`);
  lines.push(`  dead-letter-queue: ${config.resilience.deadLetterQueue ? 'yes' : 'no'}`);

  return lines.join('\n');
}
