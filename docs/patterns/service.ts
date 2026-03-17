/**
 * Pattern: Service Layer
 *
 * Key principles:
 * - All business logic lives in services, NOT in route handlers
 * - Services are stateless and composable
 * - Services throw typed errors (ApiError), routes catch and format
 * - Database access is scoped — services enforce ownership/tenancy
 * - No HTTP concepts in services (no req/res, no status codes)
 *
 * Agents: Strange (service architecture), Banner (database), Barton (errors)
 *
 * Framework adaptations:
 *   Next.js/Node: This file (Prisma ORM, const object exports)
 *   Express: Same pattern — services in /lib/, imported by route handlers
 *   Django: Service functions in app/services.py, called by views, raise custom exceptions
 *   Rails: Service objects in app/services/, called by controllers, raise custom errors
 *
 * === Django Deep Dive ===
 *
 *   # app/services/project_service.py
 *   from django.db import transaction
 *   from .models import Project
 *   from .exceptions import NotFoundError, ForbiddenError
 *
 *   class ProjectService:
 *       @staticmethod
 *       def create(user, name, description=None):
 *           return Project.objects.create(owner=user, name=name, description=description)
 *
 *       @staticmethod
 *       def get(user, project_id):
 *           try:
 *               project = Project.objects.get(id=project_id)
 *           except Project.DoesNotExist:
 *               raise NotFoundError("Project not found")
 *           if project.owner_id != user.id:
 *               raise NotFoundError("Project not found")  # 404 not 403 — no IDOR
 *           return project
 *
 *       @staticmethod
 *       @transaction.atomic
 *       def delete(user, project_id):
 *           project = ProjectService.get(user, project_id)
 *           project.delete()
 *
 *   # Key principles (same as TypeScript):
 *   # - Business logic in services, not views
 *   # - Ownership checks on every user-scoped query (return 404, not 403)
 *   # - Use QuerySet methods (filter, get, select_related) — never raw SQL
 *   # - Wrap multi-step mutations in @transaction.atomic
 *   # - Raise domain exceptions (NotFoundError, ForbiddenError) — views map to HTTP
 *
 * === FastAPI Deep Dive ===
 *
 *   # app/services/project_service.py
 *   from sqlalchemy.ext.asyncio import AsyncSession
 *   from sqlalchemy import select
 *   from .models import Project
 *   from .exceptions import NotFoundError
 *
 *   class ProjectService:
 *       def __init__(self, db: AsyncSession):
 *           self.db = db
 *
 *       async def create(self, user, name, description=None):
 *           project = Project(owner_id=user.id, name=name, description=description)
 *           self.db.add(project)
 *           await self.db.commit()
 *           await self.db.refresh(project)
 *           return project
 *
 *       async def get(self, user, project_id):
 *           result = await self.db.execute(
 *               select(Project).where(Project.id == project_id, Project.owner_id == user.id)
 *           )
 *           project = result.scalar_one_or_none()
 *           if not project:
 *               raise NotFoundError("Project not found")
 *           return project
 *
 *   # Key principles:
 *   # - Services receive db session via dependency injection (Depends)
 *   # - Async by default — all DB operations use await
 *   # - Repository pattern: service wraps SQLAlchemy queries
 *   # - Same ownership enforcement: filter by owner_id in query, not after fetch
 *
 * See /docs/patterns/error-handling.ts for the canonical error strategy.
 */

import { db } from '@/lib/db'
import { ApiError } from '@/lib/errors'

// --- Types co-located with the service ---
interface CreateProjectInput {
  name: string
  description?: string
  ownerId: string
}

interface ListProjectsInput {
  ownerId: string
  page: number
  limit: number
}

interface PaginatedResult<T> {
  items: T[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

// --- Service object (no class needed for most cases) ---
export const projectService = {
  async create(input: CreateProjectInput) {
    // Business rules enforced here, not in the route
    const existingCount = await db.project.count({
      where: { ownerId: input.ownerId },
    })

    // Tier enforcement (Ahsoka — access control)
    const MAX_PROJECTS_FREE = 5
    if (existingCount >= MAX_PROJECTS_FREE) {
      throw new ApiError(
        'PROJECT_LIMIT_REACHED',
        'Upgrade to create more projects',
        403
      )
    }

    // ALWAYS use `select` on mutations — raw Prisma results include ALL columns,
    // silently leaking sensitive fields. See /docs/patterns/api-route.ts for the rule.
    return db.project.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        ownerId: input.ownerId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  },

  async list(input: ListProjectsInput): Promise<PaginatedResult<any>> {
    const { ownerId, page, limit } = input
    const skip = (page - 1) * limit

    // Parallel queries for data + count (Banner — performance)
    const [items, total] = await Promise.all([
      db.project.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          // Only select fields needed — no over-fetching
        },
      }),
      db.project.count({ where: { ownerId } }),
    ])

    return {
      items,
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
    }
  },

  async getById(projectId: string, requestingUserId: string) {
    const project = await db.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new ApiError('NOT_FOUND', 'Project not found', 404)
    }

    // Ownership check (Ahsoka — no IDOR)
    if (project.ownerId !== requestingUserId) {
      // Return 404, not 403 — don't reveal existence
      throw new ApiError('NOT_FOUND', 'Project not found', 404)
    }

    return project
  },

  async delete(projectId: string, requestingUserId: string) {
    // Verify ownership before deletion
    const project = await this.getById(projectId, requestingUserId)

    await db.project.delete({
      where: { id: project.id },
    })
  },
}

// --- Error class (lives in /lib/errors.ts) ---
// Shown here for completeness
/*
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
*/
