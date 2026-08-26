import type { OAuthScope } from '@imogen/shared'
import type { UserRow } from '../db/schema.ts'

/**
 * Who is making a request, and what they may do. A browser session gets every scope
 * because the user is present; an OAuth token gets only what was consented to.
 */
export type Principal = {
  user: UserRow
  scopes: OAuthScope[]
  /** How the caller authenticated. Some endpoints are session-only by design. */
  via: 'session' | 'oauth' | 'share'
  sessionId?: string
  clientId?: string
}

export function hasScope(principal: Principal, scope: OAuthScope): boolean {
  return principal.scopes.includes(scope)
}
