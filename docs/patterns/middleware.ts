/**
 * Pattern: Middleware (Auth + Request Logging)
 *
 * Key principles:
 * - Auth middleware runs before route handlers
 * - Request logging captures method, path, status, duration
 * - Structured JSON logs with requestId for tracing
 * - Never log sensitive data (passwords, tokens, PII)
 * - Fail closed — if auth check errors, deny access
 *
 * Agents: Kenobi (security), Barton (error handling), L (monitoring)
 *
 * Framework adaptations:
 *   Next.js: This file (middleware.ts in root, NextRequest/NextResponse)
 *   Express: app.use(authMiddleware), app.use(requestLogger) — (err, req, res, next) for errors
 *   Django: MIDDLEWARE list in settings.py, or decorators (@login_required, @permission_required)
 *   Rails: before_action in controllers, Rack middleware for logging
 *
 * === Django Deep Dive ===
 *
 *   # app/middleware.py
 *   import time, json, logging, uuid
 *
 *   class RequestLoggingMiddleware:
 *       def __init__(self, get_response):
 *           self.get_response = get_response
 *       def __call__(self, request):
 *           request.request_id = str(uuid.uuid4())
 *           start = time.monotonic()
 *           response = self.get_response(request)
 *           duration = time.monotonic() - start
 *           logging.info(json.dumps({
 *               "request_id": request.request_id, "method": request.method,
 *               "path": request.path, "status": response.status_code,
 *               "duration_ms": round(duration * 1000),
 *               "user_id": getattr(request.user, "id", None),
 *           }))
 *           return response
 *
 *   # settings.py: MIDDLEWARE = ['app.middleware.RequestLoggingMiddleware', ...]
 *   # Order matters: logging before auth, auth before rate limiting
 *   # @login_required is per-view — use for fine-grained control, not global middleware
 *
 * === FastAPI Deep Dive ===
 *
 *   from fastapi import Request
 *   from starlette.middleware.base import BaseHTTPMiddleware
 *   import time, uuid
 *
 *   class RequestLoggingMiddleware(BaseHTTPMiddleware):
 *       async def dispatch(self, request: Request, call_next):
 *           request.state.request_id = str(uuid.uuid4())
 *           start = time.monotonic()
 *           response = await call_next(request)
 *           duration = time.monotonic() - start
 *           # structured log here
 *           return response
 *
 *   # app.add_middleware(RequestLoggingMiddleware)
 *   # For auth: prefer Depends() over middleware — dependency injection is more testable
 *   # For rate limiting: slowapi or custom Depends() with Redis
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'
import { nanoid } from 'nanoid'

// --- Auth middleware ---
export async function authMiddleware(req: NextRequest) {
  const token = req.cookies.get('session')?.value

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  try {
    // Fail closed — if verification throws, deny access (Kenobi)
    const session = await verifySessionToken(token)

    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid session' } },
        { status: 401 }
      )
    }

    // Attach session to request headers for downstream use
    const response = NextResponse.next()
    response.headers.set('x-user-id', session.userId)
    response.headers.set('x-request-id', nanoid())
    return response
  } catch {
    // Auth errors = deny, don't expose details
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }
}

// --- Request logging middleware ---
export function withRequestLogging(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = nanoid()
    const start = Date.now()

    // Add request ID for tracing
    const url = new URL(req.url)

    let response: NextResponse
    let error: unknown = null

    try {
      response = await handler(req)
    } catch (err) {
      error = err
      response = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
        { status: 500 }
      )
    }

    const duration = Date.now() - start

    // Structured log — JSON, parseable, includes tracing context (L — monitoring)
    const logEntry = {
      requestId,
      method: req.method,
      path: url.pathname,
      status: response.status,
      duration,
      userId: req.headers.get('x-user-id') || undefined,
      // Never log: request body, auth tokens, cookies, PII (Padme — data protection)
      ...(error instanceof Error && { error: error.message }),
      ...(duration > 1000 && { slow: true }), // Flag slow requests
    }

    if (response.status >= 500) {
      console.error(JSON.stringify(logEntry))
    } else if (response.status >= 400) {
      console.warn(JSON.stringify(logEntry))
    } else {
      console.log(JSON.stringify(logEntry))
    }

    // Attach request ID to response for client-side debugging
    response.headers.set('x-request-id', requestId)
    return response
  }
}

// --- Rate limiting middleware ---
// Simple in-memory rate limiter. Replace with Redis for multi-instance.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(
  req: NextRequest,
  { limit = 60, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): NextResponse | null {
  // Rate limit by IP or user ID (Ahsoka — access control)
  // IP extraction priority: cf-connecting-ip (Cloudflare, set at edge, cannot be spoofed by client)
  // > x-real-ip (nginx) > x-forwarded-for first entry (client-spoofable) > fallback
  const key =
    req.headers.get('x-user-id') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const now = Date.now()

  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs })
    return null // Allowed
  }

  entry.count++

  if (entry.count > limit) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
        },
      }
    )
  }

  return null // Allowed
}
