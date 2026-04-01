/**
 * Pattern: Multi-Tenancy (Workspace/Organization Scoping)
 *
 * Key principles:
 * - Every query is scoped to the tenant (workspace/org)
 * - Tenant context is resolved once in middleware, passed downstream
 * - Never trust client-provided tenant IDs — derive from session
 * - Cross-tenant data access is impossible by default
 * - Admin/superadmin access is explicit and audited
 *
 * Agents: Ahsoka (access control), Strange (service architecture), Kenobi (security)
 *
 * Framework adaptations:
 *   Next.js: Middleware + headers, or context in server components
 *   Django: Middleware + thread-local or django-tenants
 *   Rails: ActsAsTenant gem, or Current.workspace pattern
 *   Express: Middleware + req.workspace
 *
 * === Django Deep Dive (django-tenants) ===
 *
 *   # Schema-per-tenant: each org gets its own Postgres schema
 *   # pip install django-tenants
 *   # settings.py: DATABASE_ROUTERS, TENANT_MODEL, SHARED_APPS, TENANT_APPS
 *
 *   # Alternative: shared schema with org_id filtering
 *   class TenantMiddleware:
 *       def __call__(self, request):
 *           request.org = get_org_from_subdomain(request)
 *           return self.get_response(request)
 *
 *   # Every QuerySet filtered by org: Project.objects.filter(org=request.org)
 *   # Custom manager: class TenantManager: def for_org(self, org): return self.filter(org=org)
 *   # CRITICAL: never use .all() on tenant-scoped models — always .for_org(org)
 *
 * === FastAPI Deep Dive ===
 *
 *   # Depends() for tenant scoping — injected into every route
 *   async def get_current_org(request: Request, user = Depends(get_current_user)):
 *       org_id = request.headers.get("X-Org-Id") or user.default_org_id
 *       org = await OrgService.get(org_id)
 *       if not org or user.id not in org.member_ids:
 *           raise HTTPException(403, "Not a member of this organization")
 *       return org
 *
 *   @router.get("/projects")
 *   async def list_projects(org = Depends(get_current_org), db = Depends(get_db)):
 *       return await db.execute(select(Project).where(Project.org_id == org.id))
 *
 *   # Same principle: every query scoped by org. Never trust client-provided org_id
 *   # without verifying membership.
 */

// --- Tenant resolution middleware ---

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function tenantMiddleware(req: NextRequest) {
  const session = await getSession(req)
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  // Extract workspace from URL (e.g., /api/workspaces/:id/projects)
  const workspaceId = req.nextUrl.pathname.match(
    /\/api\/workspaces\/([^/]+)/
  )?.[1]

  if (!workspaceId) {
    return NextResponse.next()  // Not a workspace-scoped route
  }

  // Verify membership — NEVER trust the URL alone (Ahsoka — access control)
  const membership = await db.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: session.userId,
      },
    },
  })

  if (!membership) {
    // Return 404, not 403 — don't reveal workspace existence
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 }
    )
  }

  // Pass tenant context downstream via headers
  const response = NextResponse.next()
  response.headers.set('x-workspace-id', workspaceId)
  response.headers.set('x-workspace-role', membership.role)
  return response
}

// --- Tenant-scoped service ---

interface TenantContext {
  workspaceId: string
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
}

export const projectService = {
  // Every query includes the tenant scope — no exceptions
  async list(ctx: TenantContext) {
    return db.project.findMany({
      where: { workspaceId: ctx.workspaceId },  // Always scoped
      orderBy: { createdAt: 'desc' },
    })
  },

  async getById(ctx: TenantContext, projectId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
    })

    // Double-check tenant scope — defense in depth (Kenobi)
    if (!project || project.workspaceId !== ctx.workspaceId) {
      throw new ApiError('NOT_FOUND', 'Project not found', 404)
    }

    return project
  },

  async create(ctx: TenantContext, input: { name: string }) {
    // Role check — only owners, admins, and members can create
    if (ctx.role === 'viewer') {
      throw new ApiError('FORBIDDEN', 'Viewers cannot create projects', 403)
    }

    return db.project.create({
      data: {
        name: input.name,
        workspaceId: ctx.workspaceId,
        createdById: ctx.userId,
      },
    })
  },

  async delete(ctx: TenantContext, projectId: string) {
    // Only owners and admins can delete
    if (!['owner', 'admin'].includes(ctx.role)) {
      throw new ApiError('FORBIDDEN', 'Insufficient permissions', 403)
    }

    const project = await this.getById(ctx, projectId)

    await db.project.delete({ where: { id: project.id } })
  },
}

// --- Route handler using tenant context ---

import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  const ctx: TenantContext = {
    workspaceId: req.headers.get('x-workspace-id')!,
    userId: req.headers.get('x-user-id')!,
    role: req.headers.get('x-workspace-role') as TenantContext['role'],
  }

  const projects = await projectService.list(ctx)
  return NextResponse.json({ projects })
}

// --- Schema pattern (Prisma) ---
/*
model Workspace {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members  WorkspaceMember[]
  projects Project[]
}

model WorkspaceMember {
  workspaceId String
  userId      String
  role        WorkspaceRole @default(MEMBER)
  joinedAt    DateTime      @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  user      User      @relation(fields: [userId], references: [id])

  @@id([workspaceId, userId])
  @@index([userId])  // Fast lookup: "which workspaces is this user in?"
}

enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

model Project {
  id          String   @id @default(cuid())
  name        String
  workspaceId String   // Always scoped to workspace
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])
  createdBy User      @relation(fields: [createdById], references: [id])

  @@index([workspaceId])  // All queries filter by workspace
}
*/

// --- Composite primary keys for org-scoped tables ---
// Tables with natural keys need UNIQUE(natural_key, org_id) to prevent
// cross-tenant collisions. A widgetId might be unique within Org A but
// Org B can independently create the same widgetId. Without a composite
// constraint the second insert silently overwrites or fails.
//
// Prisma schema:
/*
model WidgetState {
  id          String   @id @default(cuid())
  widgetId    String                        // Natural key — unique per org, not globally
  workspaceId String
  state       Json
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([widgetId, workspaceId])         // Prevents cross-tenant collision
  @@index([workspaceId])                    // Tenant-scoped queries stay fast
}
*/
//
// Django equivalent:
//   class Meta:
//       constraints = [
//           models.UniqueConstraint(fields=['widget_id', 'org'], name='unique_widget_per_org')
//       ]
//
// Rails equivalent:
//   add_index :widget_states, [:widget_id, :workspace_id], unique: true
//
// Rule: any column that acts as a "slug", "external_id", or "name" within
// a tenant MUST have a composite unique constraint including the tenant FK.

// --- Django equivalent ---
/*
# middleware.py
class TenantMiddleware:
    def __call__(self, request):
        workspace_id = resolve_workspace_from_url(request.path)
        if workspace_id:
            membership = WorkspaceMember.objects.filter(
                workspace_id=workspace_id, user=request.user
            ).first()
            if not membership:
                return JsonResponse({'error': 'Not found'}, status=404)
            request.workspace = membership.workspace
            request.workspace_role = membership.role
        return self.get_response(request)

# services.py
class ProjectService:
    @staticmethod
    def list(workspace):
        return Project.objects.filter(workspace=workspace)

    @staticmethod
    def create(workspace, user, name):
        return Project.objects.create(
            workspace=workspace, created_by=user, name=name
        )
*/

// --- Rails equivalent ---
/*
# app/controllers/concerns/tenant_scoped.rb
module TenantScoped
  extend ActiveSupport::Concern

  before_action :set_workspace

  private

  def set_workspace
    @workspace = current_user.workspaces.find_by(id: params[:workspace_id])
    head :not_found unless @workspace
    @membership = @workspace.memberships.find_by(user: current_user)
  end

  def authorize_role!(*roles)
    head :forbidden unless roles.include?(@membership.role.to_sym)
  end
end
*/

// --- Per-tenant credential store ---
// Encrypted API key storage — keys never leave the server in plaintext.
// AES-256-GCM at rest, key derived from org-specific master key.
// Write-only admin API: responses contain metadata only (provider, timestamps).

interface TenantCredential {
  orgId: string
  provider: string           // e.g. 'stripe', 'openai', 'tiktok'
  encryptedKey: Buffer       // AES-256-GCM ciphertext + IV + auth tag
  verifiedAt: Date | null    // Last successful probe — null if never verified
  revokedAt: Date | null     // Soft-delete: non-null means revoked
}

interface CredentialMetadata {
  provider: string
  createdAt: Date
  verifiedAt: Date | null
  isRevoked: boolean
}

class CredentialStore {
  constructor(private readonly masterKeyProvider: (orgId: string) => Promise<Buffer>) {}

  /** Store a new credential. Runs a verification probe before persisting. */
  async store(orgId: string, provider: string, plainKey: string): Promise<void> {
    await this.verifyProbe(provider, plainKey)           // Fail fast if key is invalid
    const masterKey = await this.masterKeyProvider(orgId)
    const encrypted = encryptAes256Gcm(plainKey, masterKey)
    await db.tenantCredential.create({
      data: { orgId, provider, encryptedKey: encrypted, verifiedAt: new Date() },
    })
  }

  /** Decrypt for server-side use only — NEVER expose in an API response. */
  async getDecrypted(orgId: string, provider: string): Promise<string> {
    const cred = await this.findActiveCredential(orgId, provider)
    const masterKey = await this.masterKeyProvider(orgId)
    return decryptAes256Gcm(cred.encryptedKey, masterKey)
  }

  /** List credentials as metadata — no secrets returned. */
  async listMetadata(orgId: string): Promise<CredentialMetadata[]> {
    const creds = await db.tenantCredential.findMany({ where: { orgId } })
    return creds.map(c => ({
      provider: c.provider,
      createdAt: c.createdAt,
      verifiedAt: c.verifiedAt,
      isRevoked: c.revokedAt !== null,
    }))
  }

  /** Soft-revoke: marks revokedAt, old key ignored after grace period. */
  async revoke(orgId: string, provider: string): Promise<void> {
    await db.tenantCredential.updateMany({
      where: { orgId, provider, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private async findActiveCredential(orgId: string, provider: string) {
    const cred = await db.tenantCredential.findFirst({
      where: { orgId, provider, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    if (!cred) throw new ApiError('NOT_FOUND', `No active credential for ${provider}`, 404)
    return cred
  }

  /** Provider-specific liveness check before storing a key. */
  private async verifyProbe(provider: string, key: string): Promise<void> {
    // Each provider adapter exposes a lightweight health endpoint.
    // Throws ApiError('INVALID_CREDENTIAL') if the key fails.
  }
}
