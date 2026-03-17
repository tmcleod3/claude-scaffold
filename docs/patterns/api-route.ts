/**
 * Pattern: API Route Handler
 *
 * Key principles:
 * - Validate input at the boundary (Zod schema)
 * - Auth check before business logic
 * - Business logic in service layer, not the route
 * - Consistent response shape
 * - Structured error handling — never leak internals
 * - Ownership verification for user-scoped resources
 *
 * Agents: Rogers (API design), Barton (error handling), Kenobi (security)
 *
 * Framework adaptations:
 *   Next.js: This file (NextRequest/NextResponse, App Router)
 *   Express: router.post('/api/projects', validate(schema), auth, async (req, res, next) => { ... })
 *   Django: DRF ViewSet with serializer validation, permission_classes, service call
 *   Rails: Controller action with strong_params, before_action :authenticate, service call
 *
 * See /docs/patterns/error-handling.ts for the canonical error strategy.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { projectService } from '@/lib/services/projects'
import { ApiError, handleApiError } from '@/lib/errors'

// --- Input validation at the boundary ---
const createProjectSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).optional(),
})

// --- POST /api/projects ---
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getSession(req)
    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // 2. Validate input
    const body = await req.json()
    const parsed = createProjectSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      )
    }

    // 3. Business logic in service layer
    const project = await projectService.create({
      ...parsed.data,
      ownerId: session.userId,
    })

    // 4. Consistent success response
    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

// --- GET /api/projects ---
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20))

    // Service handles pagination, filtering, ownership scoping
    const result = await projectService.list({
      ownerId: session.userId,
      page,
      limit,
    })

    return NextResponse.json({
      projects: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// --- Prisma Select on Mutations ---
// RULE: Always use `select` on Prisma create/update responses. Never return
// raw Prisma results from mutations — they include ALL columns by default,
// silently leaking sensitive fields (phoneHash, email, tokens, internal IDs).
//
// BAD:  const user = await db.user.update({ where: { id }, data: { name } })
//       return NextResponse.json({ user })  // leaks phoneHash, email, etc.
//
// GOOD: const user = await db.user.update({
//         where: { id }, data: { name },
//         select: { id: true, name: true, avatar: true }
//       })
//       return NextResponse.json({ user })  // only selected fields
//
// This applies to create(), update(), upsert(), and any mutation that returns data.
// findMany/findUnique already use select in the service pattern — mutations must too.
// (Field report #36: Prisma update() without select leaked phoneHash and whatsappId.)

// --- Fire-and-Forget Endpoints (sendBeacon) ---
// navigator.sendBeacon() cannot set custom headers — it sends a plain POST with
// Content-Type: text/plain. This makes it incompatible with header-based CSRF
// enforcement (X-CSRF-Token). For analytics/telemetry endpoints that use sendBeacon:
//
// 1. Exempt the endpoint from CSRF header checks
// 2. Add compensating controls: per-IP rate limiting, session cookie validation,
//    origin check via Referer/Origin header (browsers always send these on sendBeacon)
// 3. Ensure the endpoint only WRITES (append-only) — never reads or mutates user data
// 4. Log the exemption in the security audit
//
// Pattern:
//   POST /api/analytics/event  — exempt from X-CSRF-Token
//   Validation: session cookie + origin header + rate limit (100/min/IP)
//   Data: append-only event log, no user data returned in response
//
// (Field report #36: analytics endpoint failed silently because sendBeacon
// couldn't attach the CSRF header.)

// --- Consistent error handler (shared across all routes) ---
// Located in /lib/errors.ts — shown here for reference
/*
export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    )
  }

  // Log unexpected errors with context, never expose to client
  console.error('[API Error]', {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  })

  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    { status: 500 }
  )
}
*/
