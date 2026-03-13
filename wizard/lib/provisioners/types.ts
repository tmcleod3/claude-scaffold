/**
 * Provisioner interfaces — shared across all deploy targets.
 */

export interface ProvisionContext {
  runId: string;
  projectDir: string;
  projectName: string;
  deployTarget: string;
  framework: string;
  database: string;    // postgres | mysql | sqlite | none
  cache: string;       // redis | none
  instanceType: string; // t3.micro | t3.small | t3.medium | t3.large (VPS only)
  hostname: string;     // DNS hostname for Cloudflare DNS wiring (optional)
  credentials: Record<string, string>;
}

export interface ProvisionEvent {
  step: string;
  status: 'started' | 'done' | 'error' | 'skipped';
  message: string;
  detail?: string;
}

export type ProvisionEmitter = (event: ProvisionEvent) => void;

export interface CreatedResource {
  type: string;      // e.g. 'ec2-instance', 'security-group', 'key-pair', 'rds-instance'
  id: string;        // AWS resource ID
  region: string;
}

export interface ProvisionResult {
  success: boolean;
  resources: CreatedResource[];
  outputs: Record<string, string>;   // SSH_HOST, DB_HOST, etc.
  files: string[];                   // files written to projectDir
  error?: string;
}

export interface Provisioner {
  validate(ctx: ProvisionContext): Promise<string[]>;
  provision(ctx: ProvisionContext, emit: ProvisionEmitter): Promise<ProvisionResult>;
  cleanup(resources: CreatedResource[], credentials: Record<string, string>): Promise<void>;
}
