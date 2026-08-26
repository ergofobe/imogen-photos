import { and, eq, gt, lt } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { sessions } from '../db/schema.ts'
import { generateToken, hashToken } from '../lib/tokens.ts'

const SESSION_TTL_DAYS = 30
export const SESSION_COOKIE = 'imogen_session'

export type SessionContext = { userAgent?: string | null; ipAddress?: string | null }

export class SessionService {
  constructor(private readonly db: Database) {}

  async create(userId: string, context: SessionContext) {
    const token = generateToken('imog_s', 32)
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId,
        tokenHash: hashToken(token),
        userAgent: context.userAgent ?? null,
        ipAddress: context.ipAddress ?? null,
        expiresAt,
      })
      .returning()
    return { token, session: row!, expiresAt }
  }

  async resolve(token: string) {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1)
    if (!row) return null
    return { userId: row.userId, sessionId: row.id }
  }

  async touch(sessionId: string) {
    await this.db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId))
  }

  async revoke(token: string) {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)))
  }

  async revokeAllForUser(userId: string) {
    await this.db.delete(sessions).where(eq(sessions.userId, userId))
  }

  async listForUser(userId: string) {
    return this.db.select().from(sessions).where(eq(sessions.userId, userId))
  }

  /** Removes expired rows. Called by the maintenance job, not on the request path. */
  async pruneExpired() {
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  }

  cookieOptions(expiresAt: Date, secure: boolean) {
    return {
      httpOnly: true,
      secure,
      sameSite: 'Lax' as const,
      path: '/',
      expires: expiresAt,
    }
  }
}
