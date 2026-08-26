import type { z } from '@hono/zod-openapi'
import { ApiError } from '@imogen/shared'

/** The response envelope every failing endpoint shares, described once. */
const errorContent = { 'application/json': { schema: ApiError } }

export const ERROR_RESPONSES = {
  400: { description: 'The request was malformed or failed validation', content: errorContent },
  401: { description: 'Authentication required', content: errorContent },
  403: { description: 'Authenticated, but not permitted', content: errorContent },
  404: { description: 'No such resource', content: errorContent },
} as const

export const CONFLICT_RESPONSE = {
  409: { description: 'Conflicts with existing state', content: errorContent },
} as const

export function ok<T extends z.ZodType>(schema: T, description: string) {
  return { 200: { description, content: { 'application/json': { schema } } } }
}

export function created<T extends z.ZodType>(schema: T, description: string) {
  return { 201: { description, content: { 'application/json': { schema } } } }
}

export const NO_CONTENT = {
  204: { description: 'Done. No body.' },
} as const

/**
 * Applied to every authenticated route so the OpenAPI document describes auth once.
 * A function, because each route needs its own mutable array.
 */
export const security = (): Array<Record<string, string[]>> => [
  { sessionCookie: [] },
  { oauth2: [] },
]
