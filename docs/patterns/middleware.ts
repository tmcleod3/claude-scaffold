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

// =============================================================================
// Cookie Authentication
// =============================================================================

/**
 * 1. Setting HttpOnly Cookies on Login
 *
 * After successful authentication, set the JWT in an HttpOnly cookie.
 * HttpOnly prevents XSS from reading the token. Secure ensures HTTPS only.
 * SameSite=Lax blocks cross-site POST requests while allowing top-level navigation.
 *
 * === Express / Next.js API Route ===
 *
 *   // POST /api/auth/login
 *   const token = await createSessionToken(user.id)
 *   res.setHeader('Set-Cookie', [
 *     `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`,
 *   ])
 *   // Next.js App Router: use cookies() from 'next/headers'
 *   //   cookies().set('session', token, {
 *   //     httpOnly: true, secure: true, sameSite: 'lax',
 *   //     path: '/', maxAge: 7 * 24 * 60 * 60,
 *   //   })
 *   res.json({ user: { id: user.id, email: user.email } })
 *
 * === Django / FastAPI ===
 *
 *   # Django view
 *   response = JsonResponse({"user": {"id": user.id}})
 *   response.set_cookie("session", token, httponly=True, secure=True,
 *                        samesite="Lax", max_age=7 * 24 * 60 * 60)
 *
 *   # FastAPI endpoint
 *   response = JSONResponse({"user": {"id": user.id}})
 *   response.set_cookie("session", token, httponly=True, secure=True,
 *                        samesite="lax", max_age=7 * 24 * 60 * 60)
 */

/**
 * 2. Reading Cookies with Bearer Fallback
 *
 * Check cookie first (browser clients), then Authorization header (API clients).
 * This lets the same endpoint serve both contexts without separate auth flows.
 */
export async function authMiddlewareWithCookieFallback(req: NextRequest) {
  // Cookie takes priority — browser clients send this automatically
  let token = req.cookies.get('session')?.value

  // Bearer fallback — API clients, mobile apps, server-to-server
  if (!token) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  try {
    // Fail closed — same principle as authMiddleware (Kenobi)
    const session = await verifySessionToken(token)
    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Invalid session' } },
        { status: 401 }
      )
    }

    const response = NextResponse.next()
    response.headers.set('x-user-id', session.userId)
    response.headers.set('x-request-id', nanoid())
    return response
  } catch {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }
}

/**
 * 3. CSRF Protection via Custom Header
 *
 * SameSite=Lax already blocks cross-site POSTs, but defense-in-depth matters (Kenobi).
 * Require X-Requested-With on all mutation endpoints. Browsers enforce CORS preflight
 * on custom headers, so a cross-origin attacker cannot set this without server consent.
 *
 * === Django / FastAPI ===
 *
 *   # Django: use built-in CsrfViewMiddleware OR check custom header
 *   class CSRFCustomHeaderMiddleware:
 *       def __call__(self, request):
 *           if request.method in ("POST", "PUT", "DELETE", "PATCH"):
 *               if request.headers.get("X-Requested-With") != "XMLHttpRequest":
 *                   return JsonResponse({"error": "CSRF check failed"}, status=403)
 *           return self.get_response(request)
 *
 *   # FastAPI: use Depends() for the same check
 *   async def require_csrf_header(request: Request):
 *       if request.method in ("POST", "PUT", "DELETE", "PATCH"):
 *           if request.headers.get("x-requested-with") != "XMLHttpRequest":
 *               raise HTTPException(403, "CSRF check failed")
 */
const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

export function csrfProtection(req: NextRequest): NextResponse | null {
  if (!MUTATION_METHODS.has(req.method)) {
    return null // GET/HEAD/OPTIONS — no CSRF risk
  }

  // Cookie-based auth requires the custom header; Bearer tokens are not vulnerable
  const hasCookie = req.cookies.has('session')
  const hasCustomHeader = req.headers.get('x-requested-with') === 'XMLHttpRequest'

  if (hasCookie && !hasCustomHeader) {
    return NextResponse.json(
      { error: { code: 'CSRF_FAILED', message: 'Missing X-Requested-With header' } },
      { status: 403 }
    )
  }

  return null // Allowed
}

/**
 * 4. Frontend Fetch Configuration
 *
 * When using cookie auth, every fetch() call must include credentials: 'include'.
 * Without it, the browser won't send or accept cookies on cross-origin requests.
 * This typed wrapper enforces that and sets the CSRF header automatically.
 */
type ApiResponse<T> = { data: T } | { error: { code: string; message: string } }

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include', // Required — sends cookies with every request
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // CSRF protection for cookie auth
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    return { error: body.error ?? { code: 'UNKNOWN', message: response.statusText } }
  }

  return { data: await response.json() }
}

// Usage:
//   const result = await apiFetch<{ user: User }>('/api/users/me')
//   if ('error' in result) { handleError(result.error) }
//   else { renderUser(result.data.user) }
