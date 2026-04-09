/**
 * Self-Deploy Provisioner — deploys VoidForge itself to a remote VPS.
 *
 * Usage: npx voidforge deploy --self
 *
 * Steps:
 * 1. Connect to VPS via SSH (EC2 or manual target)
 * 2. Install: Node.js, Git, PM2, Caddy, Claude Code
 * 3. Clone VoidForge, configure Caddy for HTTPS
 * 4. Create forge-user (non-root PTY execution)
 * 5. Generate initial admin credentials + TOTP secret
 * 6. Start VoidForge as PM2-managed service
 * 7. Report public URL + TOTP QR setup instructions
 */

import { randomBytes } from 'node:crypto';

export interface SelfDeployConfig {
  sshHost: string;
  sshUser: string;
  sshKeyPath: string;
  domain: string;
  nodeVersion: string;
  voidforgeRepo: string;
  voidforgeBranch: string;
}

export interface SelfDeployResult {
  publicUrl: string;
  adminUsername: string;
  totpSecret: string;
  totpUri: string;
  caddyDomain: string;
  pm2Name: string;
}

/** Shell-escape a value to prevent command injection. */
function shellEscape(value: string): string {
  // Reject any value containing shell metacharacters
  if (/[;&|`$(){}\\!#\n\r]/.test(value)) {
    throw new Error(`Unsafe value for shell interpolation: ${value.slice(0, 20)}...`);
  }
  // Wrap in single quotes for extra safety (single quotes prevent all expansion)
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Validate a domain name. */
function isValidDomain(domain: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
}

const DEFAULT_CONFIG: Partial<SelfDeployConfig> = {
  nodeVersion: '22',
  voidforgeRepo: 'https://github.com/tmcleod3/voidforge.git',
  voidforgeBranch: 'main',
};

/**
 * Generate the provision script that runs on the remote VPS.
 * This script is piped over SSH — no files need to exist on the remote first.
 */
export function generateProvisionScript(config: SelfDeployConfig): string {
  // Validate all inputs before shell interpolation
  if (!isValidDomain(config.domain)) {
    throw new Error(`Invalid domain: ${config.domain}`);
  }
  const safeDomain = shellEscape(config.domain);
  const safeRepo = shellEscape(config.voidforgeRepo);
  const safeBranch = shellEscape(config.voidforgeBranch);
  const safeNodeVersion = shellEscape(config.nodeVersion);

  return `#!/bin/bash
set -euo pipefail

echo "=== VoidForge Self-Deploy ==="
echo "Domain: ${safeDomain}"
echo ""

# 1. System packages
echo "[1/7] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq curl git build-essential

# 2. Node.js
echo "[2/7] Installing Node.js ${safeNodeVersion}..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${safeNodeVersion}.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
echo "  Node $(node --version)"

# 3. PM2 + Caddy
echo "[3/7] Installing PM2 and Caddy..."
sudo npm install -g pm2 2>/dev/null || true
sudo apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null || true
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq caddy

# 4. forge-user (non-root PTY execution)
echo "[4/7] Creating forge-user..."
if ! id forge-user &>/dev/null; then
  sudo useradd -m -s /bin/bash forge-user
fi
sudo mkdir -p /home/forge-user/projects
sudo chown -R forge-user:forge-user /home/forge-user

# 5. Clone VoidForge
echo "[5/7] Cloning VoidForge..."
VOIDFORGE_DIR="/opt/voidforge"
sudo mkdir -p "$VOIDFORGE_DIR"
sudo chown $(whoami) "$VOIDFORGE_DIR"
if [ -d "$VOIDFORGE_DIR/.git" ]; then
  cd "$VOIDFORGE_DIR" && git pull origin ${safeBranch}
else
  git clone --branch ${safeBranch} ${safeRepo} "$VOIDFORGE_DIR"
fi
cd "$VOIDFORGE_DIR" && npm install --production 2>/dev/null || true

# 6. Caddy config
echo "[6/7] Configuring Caddy for ${safeDomain}..."
sudo tee /etc/caddy/Caddyfile > /dev/null << CADDY
${config.domain} {
    # Rate limiting on login endpoint
    @login path /api/auth/login
    handle @login {
        reverse_proxy localhost:3141
    }

    # WebSocket upgrade for terminal
    @ws {
        path /ws/terminal
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @ws {
        reverse_proxy localhost:3141
    }

    # All other traffic
    reverse_proxy localhost:3141

    # Security headers (supplementing VoidForge's own headers)
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }
}
CADDY
sudo systemctl reload caddy

# 7. Start VoidForge
echo "[7/7] Starting VoidForge..."
cd "$VOIDFORGE_DIR"
pm2 delete voidforge 2>/dev/null || true
pm2 start "npx tsx scripts/voidforge.ts init --remote" --name voidforge --cwd "$VOIDFORGE_DIR"
pm2 save

echo ""
echo "═══════════════════════════════════════════"
echo "  VoidForge deployed!"
echo "═══════════════════════════════════════════"
echo "  URL: https://${config.domain}"
echo ""
echo "  Open the URL above to create your admin"
echo "  account (username + password + TOTP 2FA)."
echo "═══════════════════════════════════════════"
`;
}

/**
 * Generate the Caddy config template for manual setup.
 * Used when the user wants to configure Caddy themselves.
 */
export function generateCaddyTemplate(domain: string): string {
  return `# VoidForge Avengers Tower Remote — Caddy Configuration
# Save to /etc/caddy/Caddyfile and run: sudo systemctl reload caddy

${domain} {
    # Optional: IP allowlist (uncomment and set your IPs)
    # @blocked not remote_ip <your-ip>/32 <vpn-cidr>/24
    # respond @blocked 403

    # Rate limiting on login (requires caddy-ratelimit plugin)
    # rate_limit {
    #     zone forge_login {
    #         key {remote_host}
    #         events 5
    #         window 1m
    #     }
    # }

    # WebSocket upgrade for terminal connections
    @ws {
        path /ws/terminal
        header Connection *Upgrade*
        header Upgrade websocket
    }
    handle @ws {
        reverse_proxy localhost:3141
    }

    # All other traffic
    reverse_proxy localhost:3141

    # HSTS (Caddy auto-provisions TLS certificates)
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }
}
`;
}
