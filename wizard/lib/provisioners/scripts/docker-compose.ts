/**
 * docker-compose.yml template generator.
 */

interface ComposeOptions {
  projectName: string;
  framework: string;
  database: string;   // postgres | mysql | sqlite | none
  cache: string;      // redis | none
}

export function generateDockerCompose(opts: ComposeOptions): string {
  const services: string[] = [];
  const volumes: string[] = [];
  const envVars: string[] = [];

  // App service
  const appPort = opts.framework === 'django' ? '8000' : '3000';
  const depends: string[] = [];
  if (opts.database === 'postgres' || opts.database === 'mysql') depends.push('db');
  if (opts.cache === 'redis') depends.push('redis');

  let appService = `  app:
    build: .
    ports:
      - "\${PORT:-${appPort}}:${appPort}"
    env_file:
      - .env
    restart: unless-stopped`;

  if (depends.length > 0) {
    appService += `\n    depends_on:\n${depends.map((d) => `      ${d}:\n        condition: service_healthy`).join('\n')}`;
  }

  services.push(appService);

  // Database service
  if (opts.database === 'postgres') {
    envVars.push('DATABASE_URL=postgresql://postgres:postgres@db:5432/${DB_NAME:-app}');
    services.push(`  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: \${DB_NAME:-app}
    ports:
      - "\${DB_PORT:-5432}:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped`);
    volumes.push('  db_data:');
  }

  if (opts.database === 'mysql') {
    envVars.push('DATABASE_URL=mysql://root:mysql@db:3306/${DB_NAME:-app}');
    services.push(`  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: mysql
      MYSQL_DATABASE: \${DB_NAME:-app}
    ports:
      - "\${DB_PORT:-3306}:3306"
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped`);
    volumes.push('  db_data:');
  }

  // Cache service
  if (opts.cache === 'redis') {
    envVars.push('REDIS_URL=redis://redis:6379');
    services.push(`  redis:
    image: redis:7-alpine
    ports:
      - "\${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped`);
  }

  let compose = `services:\n${services.join('\n\n')}\n`;

  if (volumes.length > 0) {
    compose += `\nvolumes:\n${volumes.join('\n')}\n`;
  }

  return compose;
}
