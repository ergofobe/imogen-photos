import { ERROR_CODES, type ErrorCode } from '@imogen/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** An error that already knows how it should look on the wire. */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: ErrorCode
  readonly details?: Record<string, string[]>

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (m: string, d?: Record<string, string[]>) =>
  new HttpError(400, ERROR_CODES.BAD_REQUEST, m, d)
export const unauthorized = (m = 'Authentication required') =>
  new HttpError(401, ERROR_CODES.UNAUTHORIZED, m)
export const forbidden = (m = 'You do not have access to that') =>
  new HttpError(403, ERROR_CODES.FORBIDDEN, m)
export const notFound = (m = 'Not found') => new HttpError(404, ERROR_CODES.NOT_FOUND, m)
export const conflict = (m: string) => new HttpError(409, ERROR_CODES.CONFLICT, m)
export const payloadTooLarge = (m: string) => new HttpError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, m)
export const unsupportedMediaType = (m: string) =>
  new HttpError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, m)
export const quotaExceeded = (m: string) => new HttpError(413, ERROR_CODES.QUOTA_EXCEEDED, m)

export function insufficientScope(required: string) {
  return new HttpError(
    403,
    ERROR_CODES.INSUFFICIENT_SCOPE,
    `This token is missing the "${required}" scope`,
  )
}

export function errorBody(error: HttpError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  }
}

export function respondWithError(c: Context, error: unknown) {
  if (error instanceof HttpError) {
    return c.json(errorBody(error), error.status)
  }
  console.error('unhandled error', error)
  return c.json(
    { error: { code: ERROR_CODES.INTERNAL, message: 'Something went wrong on the server' } },
    500,
  )
}
