import { ALL_SCOPES, type OAuthScope } from '@imogen/shared'
import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Principal } from '../lib/context.ts'
import { insufficientScope, notFound, unauthorized } from '../lib/errors.ts'
import type { Services } from '../services.ts'
import { SESSION_COOKIE } from './sessions.ts'

export type AppEnv = {
  Variables: {
    services: Services
    principal: Principal
  }
}

/**
 * Resolves a caller from either a browser session cookie or an OAuth bearer token,
 * and attaches it to the request. A session carries every scope because the user is
 * sitting there; a token carries only what they consented to give an application.
 */
export async function resolvePrincipal(
  services: Services,
  headers: Headers,
  cookieToken: string | undefined,
): Promise<Principal | null> {
  const authorization = headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim()
    const grant = await services.oauth.verifyAccessToken(token)
    if (!grant) return null
    const user = await services.accounts.findById(grant.userId)
    if (!user) return null
    return { user, scopes: grant.scopes, via: 'oauth', clientId: grant.clientId }
  }

  if (cookieToken) {
    const session = await services.sessions.resolve(cookieToken)
    if (!session) return null
    const user = await services.accounts.findById(session.userId)
    if (!user) return null
    return { user, scopes: [...ALL_SCOPES], via: 'session', sessionId: session.sessionId }
  }

  return null
}

/** Attaches a principal when one is present, without rejecting anonymous requests. */
export function optionalAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const services = c.get('services')
    const principal = await resolvePrincipal(
      services,
      c.req.raw.headers,
      getCookie(c, SESSION_COOKIE),
    )
    if (principal) c.set('principal', principal)
    await next()
  }
}

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const services = c.get('services')
    const principal = await resolvePrincipal(
      services,
      c.req.raw.headers,
      getCookie(c, SESSION_COOKIE),
    )
    if (!principal) {
      // RFC 9728: point unauthenticated clients at the metadata that tells them how to auth.
      c.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${services.config.publicUrl}/.well-known/oauth-protected-resource"`,
      )
      throw unauthorized()
    }
    if (principal.sessionId) void services.sessions.touch(principal.sessionId)
    c.set('principal', principal)
    await next()
  }
}

export function requireScope(scope: OAuthScope): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const principal = c.get('principal')
    if (!principal) throw unauthorized()
    if (!principal.scopes.includes(scope)) throw insufficientScope(scope)
    await next()
  }
}

export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const principal = c.get('principal')
    if (!principal) throw unauthorized()
    if (principal.user.role !== 'admin') {
      throw insufficientScope('administrator')
    }
    await next()
  }
}

/**
 * Guards the administration API by pretending it is not there.
 *
 * Every other guard tells the caller what went wrong, because a legitimate client
 * needs to know whether to sign in or to ask for another scope. This one does the
 * opposite: an anonymous request, an expired session and a perfectly valid ordinary
 * account all get the same 404 the server gives for a path it has never heard of.
 *
 * Scanners look for the panel, not for a way past it, and a 401 or 403 answers the
 * only question they are asking. So the principal is resolved here rather than by
 * `requireAuth`, whose job is to explain itself — including a `WWW-Authenticate`
 * header naming the authorization server, which would give the game away on its own.
 */
export function requireHiddenAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const services = c.get('services')
    const principal = await resolvePrincipal(
      services,
      c.req.raw.headers,
      getCookie(c, SESSION_COOKIE),
    )
    // Word for word what the server says for a path it has never heard of. A message
    // of its own — "Not found" against "No route for /api/v1/admin/users" — would be
    // the whole disguise undone, since only a mounted router can answer differently.
    if (principal?.user.role !== 'admin') throw notFound(`No route for ${c.req.path}`)

    if (principal.sessionId) void services.sessions.touch(principal.sessionId)
    c.set('principal', principal)
    await next()
  }
}
