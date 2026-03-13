/**
 * Dockerfile template generator — multi-stage builds per framework.
 */

export function generateDockerfile(framework: string): string {
  switch (framework) {
    case 'next.js':
      return nextjsDockerfile();
    case 'express':
      return expressDockerfile();
    case 'django':
      return djangoDockerfile();
    case 'rails':
      return railsDockerfile();
    default:
      return nodeDockerfile();
  }
}

function nextjsDockerfile(): string {
  return `# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["wget", "--spider", "-q", "http://localhost:3000/", "||", "exit", "1"]

CMD ["node", "server.js"]
`;
}

function expressDockerfile(): string {
  return `# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup
RUN adduser --system --uid 1001 appuser

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["wget", "--spider", "-q", "http://localhost:3000/", "||", "exit", "1"]

CMD ["node", "dist/index.js"]
`;
}

function djangoDockerfile(): string {
  return `FROM python:3.12-slim

WORKDIR /app

RUN addgroup --system --gid 1001 appgroup && \\
    adduser --system --uid 1001 --gid 1001 appuser

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/')"]

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "config.wsgi:application"]
`;
}

function railsDockerfile(): string {
  return `FROM ruby:3.3-slim

WORKDIR /app

RUN apt-get update -qq && \\
    apt-get install --no-install-recommends -y build-essential libpq-dev && \\
    rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN bundle install --without development test

COPY . .

RUN bundle exec rails assets:precompile

RUN addgroup --system --gid 1001 appgroup && \\
    adduser --system --uid 1001 --gid 1001 appuser && \\
    chown -R appuser:appgroup /app

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["wget", "--spider", "-q", "http://localhost:3000/", "||", "exit", "1"]

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
`;
}

function nodeDockerfile(): string {
  return `# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 appgroup
RUN adduser --system --uid 1001 appuser

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\
  CMD ["wget", "--spider", "-q", "http://localhost:3000/", "||", "exit", "1"]

CMD ["node", "dist/index.js"]
`;
}

export function generateDockerignore(): string {
  return `node_modules
.git
.gitignore
.env
.env.*
*.md
logs/
docs/
.claude/
.next/cache
dist/
coverage/
.vscode/
.idea/
*.log
`;
}
