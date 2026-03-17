/**
 * Pattern: Error Handling Strategy (Canonical Reference)
 *
 * This is the single source of truth for error handling across VoidForge.
 * All other patterns (api-route.ts, service.ts, middleware.ts) reference this.
 *
 * Key principles:
 * - Custom error types with codes, not raw Error throws
 * - Catch at boundaries (route handlers), not in services
 * - Never leak internals (stack traces, DB errors, file paths)
 * - Structured error responses with consistent shape
 * - Log errors with context (requestId, userId, action)
 * - Different handling for operational vs programmer errors
 *
 * Agents: Barton (error handling), Kenobi (security — never leak), L (monitoring)
 *
 * Framework adaptations:
 *   Next.js: Global error handler in middleware or route wrapper
 *   Django: Custom exception handler in DRF, or middleware
 *   Rails: rescue_from in ApplicationController
 *   Express: Error-handling middleware (err, req, res, next)
 *
 * === Django Deep Dive (DRF) ===
 *
 *   # app/exceptions.py — domain exceptions (same shape as TypeScript ApiError)
 *   class AppError(Exception):
 *       def __init__(self, message, status_code=500, code="INTERNAL_ERROR"):
 *           self.message = message
 *           self.status_code = status_code
 *           self.code = code
 *
 *   class NotFoundError(AppError):
 *       def __init__(self, message="Not found"):
 *           super().__init__(message, 404, "NOT_FOUND")
 *
 *   class ForbiddenError(AppError):
 *       def __init__(self, message="Forbidden"):
 *           super().__init__(message, 403, "FORBIDDEN")
 *
 *   class ValidationError(AppError):
 *       def __init__(self, message="Validation failed"):
 *           super().__init__(message, 400, "VALIDATION_ERROR")
 *
 *   # settings.py — register custom handler
 *   REST_FRAMEWORK = {
 *       'EXCEPTION_HANDLER': 'app.exception_handler.custom_exception_handler'
 *   }
 *
 *   # app/exception_handler.py
 *   def custom_exception_handler(exc, context):
 *       if isinstance(exc, AppError):
 *           return Response(
 *               {"success": False, "error": exc.message, "code": exc.code},
 *               status=exc.status_code
 *           )
 *       # Fall through to DRF default for validation errors, auth errors, etc.
 *       response = exception_handler(exc, context)
 *       if response: return response
 *       # Unhandled — log and return 500 (never leak internals)
 *       logger.error(f"Unhandled: {exc}", exc_info=True)
 *       return Response({"success": False, "error": "Internal error"}, status=500)
 *
 * === FastAPI Deep Dive ===
 *
 *   # app/exceptions.py — same domain exceptions
 *   class AppError(Exception):
 *       def __init__(self, message: str, status_code: int = 500, code: str = "INTERNAL_ERROR"):
 *           self.message = message
 *           self.status_code = status_code
 *           self.code = code
 *
 *   # app/main.py — register handler
 *   @app.exception_handler(AppError)
 *   async def app_error_handler(request, exc: AppError):
 *       return JSONResponse(
 *           status_code=exc.status_code,
 *           content={"success": False, "error": exc.message, "code": exc.code}
 *       )
 *
 *   @app.exception_handler(Exception)
 *   async def unhandled_error_handler(request, exc):
 *       logger.error(f"Unhandled: {exc}", exc_info=True)
 *       return JSONResponse(
 *           status_code=500,
 *           content={"success": False, "error": "Internal error"}
 *       )
 *
 *   # Pydantic validation errors are handled automatically by FastAPI (422)
 *   # Never leak stack traces — the unhandled handler catches everything
 */

// ============================================================
// 1. ERROR TYPES — used across all services
// ============================================================

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

// Pre-built errors for common cases
export const Errors = {
  unauthorized: () => new ApiError('UNAUTHORIZED', 'Authentication required', 401),
  forbidden: () => new ApiError('FORBIDDEN', 'Insufficient permissions', 403),
  notFound: (resource = 'Resource') => new ApiError('NOT_FOUND', `${resource} not found`, 404),
  validation: (details: Record<string, string[]>) =>
    Object.assign(new ApiError('VALIDATION_ERROR', 'Invalid input', 400), { details }),
  conflict: (message: string) => new ApiError('CONFLICT', message, 409),
  rateLimited: () => new ApiError('RATE_LIMITED', 'Too many requests', 429),
  internal: () => new ApiError('INTERNAL_ERROR', 'Something went wrong', 500),
} as const

// ============================================================
// 2. ERROR RESPONSE SHAPE — consistent across all routes
// ============================================================

/*
Success:
{
  "data": { ... }
}

Error:
{
  "error": {
    "code": "VALIDATION_ERROR",      // Machine-readable
    "message": "Invalid input",       // Human-readable
    "details": { ... }                // Optional — field-level errors
  }
}

Never include:
- Stack traces
- Internal file paths
- Database error messages
- SQL queries
- Environment variable names
*/

// ============================================================
// 3. GLOBAL ERROR HANDLER — catches everything at the boundary
// ============================================================

import { NextResponse } from 'next/server'

export function handleApiError(error: unknown): NextResponse {
  // Known operational errors — safe to expose
  if (error instanceof ApiError) {
    const body: Record<string, unknown> = {
      error: {
        code: error.code,
        message: error.message,
      },
    }

    // Include validation details if present
    if ('details' in error) {
      (body.error as Record<string, unknown>).details = (error as any).details
    }

    return NextResponse.json(body, { status: error.status })
  }

  // Unknown/programmer errors — log everything, expose nothing
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  const errorStack = error instanceof Error ? error.stack : undefined

  // Structured log with full context (L — monitoring)
  console.error(JSON.stringify({
    event: 'unhandled_error',
    message: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
    // requestId and userId would be added by logging middleware
  }))

  // Generic response — never leak internals (Kenobi)
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    { status: 500 }
  )
}

// ============================================================
// 4. USAGE IN SERVICES — throw typed errors
// ============================================================

/*
// In a service:
async function getProject(id: string, userId: string) {
  const project = await db.project.findUnique({ where: { id } })

  if (!project) {
    throw Errors.notFound('Project')  // 404 — clear, typed
  }

  if (project.ownerId !== userId) {
    throw Errors.notFound('Project')  // 404 (not 403) — don't reveal existence
  }

  return project
}

// In a route handler:
export async function GET(req: NextRequest) {
  try {
    const project = await getProject(id, userId)
    return NextResponse.json({ data: project })
  } catch (error) {
    return handleApiError(error)  // Single catch, handles everything
  }
}
*/

// ============================================================
// 5. OPERATIONAL vs PROGRAMMER ERRORS
// ============================================================

/*
OPERATIONAL (expected, handled):
- User not found → 404
- Invalid input → 400
- Unauthorized → 401
- Rate limited → 429
- External API down → 503 (with retry header)
→ Throw ApiError. The handler returns the right status code.

PROGRAMMER (unexpected, bugs):
- TypeError, ReferenceError
- Unhandled promise rejection
- Database connection lost
- Out of memory
→ Caught by handleApiError's fallback. Returns 500. Logged with full stack.
  These indicate bugs — investigate and fix the root cause.
*/

// ============================================================
// 6. FRAMEWORK ADAPTATIONS
// ============================================================

// --- Express error middleware ---
/*
// middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message }
    })
  }

  console.error(JSON.stringify({
    event: 'unhandled_error',
    message: err instanceof Error ? err.message : 'Unknown',
    path: req.path,
    method: req.method,
  }))

  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' }
  })
}

// app.ts — register LAST
app.use(errorHandler)
*/

// --- Django exception handler ---
/*
# utils/exceptions.py
from rest_framework.views import exception_handler
from rest_framework.response import Response

def custom_exception_handler(exc, context):
    if isinstance(exc, ApiError):
        return Response(
            {'error': {'code': exc.code, 'message': str(exc)}},
            status=exc.status_code
        )

    response = exception_handler(exc, context)
    if response is None:
        logger.error(f'Unhandled error: {exc}', exc_info=True)
        return Response(
            {'error': {'code': 'INTERNAL_ERROR', 'message': 'Something went wrong'}},
            status=500
        )
    return response
*/

// --- Rails rescue_from ---
/*
# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
  rescue_from ApiError do |e|
    render json: { error: { code: e.code, message: e.message } }, status: e.status
  end

  rescue_from StandardError do |e|
    Rails.logger.error("Unhandled error: #{e.message}\n#{e.backtrace.first(5).join("\n")}")
    render json: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
           status: :internal_server_error
  end
end
*/
