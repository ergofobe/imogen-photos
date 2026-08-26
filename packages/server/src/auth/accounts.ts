import type { PasswordChangeRequest, SignupRequest, User } from '@imogen/shared'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { type UserRow, users } from '../db/schema.ts'

export class AuthError extends Error {
  readonly status: number
  readonly code: string

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}

/**
 * Argon2id with parameters that cost roughly 100ms on a home lab CPU. Slow enough to
 * make a stolen database expensive to crack, fast enough that logging in feels instant.
 */
const ARGON2 = { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 } as const

export function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatarUrl,
    oidcSubject: row.oidcSubject,
    hasPassword: row.passwordHash !== null,
    createdAt: row.createdAt.toISOString(),
    quotaBytes: row.quotaBytes,
    usedBytes: row.usedBytes,
  }
}

export class AccountService {
  constructor(
    private readonly db: Database,
    private readonly options: { allowSignup: boolean },
  ) {}

  async countUsers(): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(users)
    return row?.count ?? 0
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1)
    return row ?? null
  }

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ?? null
  }

  async signup(request: SignupRequest): Promise<User> {
    const isFirstUser = (await this.countUsers()) === 0
    // Somebody has to be able to get in, so the first account is always permitted.
    if (!isFirstUser && !this.options.allowSignup) {
      throw new AuthError('signup_disabled', 'Sign-up is disabled on this server', 403)
    }
    if (await this.findByEmail(request.email)) {
      throw new AuthError('email_taken', 'That email address is already registered', 409)
    }

    const passwordHash = await Bun.password.hash(request.password, ARGON2)
    const [row] = await this.db
      .insert(users)
      .values({
        email: request.email,
        name: request.name,
        passwordHash,
        role: isFirstUser ? 'admin' : 'user',
      })
      .returning()
    return toPublicUser(row!)
  }

  async verifyPassword(email: string, password: string): Promise<UserRow | null> {
    const row = await this.findByEmail(email)
    // OIDC-only accounts have no local password, so nothing can match.
    if (!row?.passwordHash) return null
    return (await Bun.password.verify(password, row.passwordHash)) ? row : null
  }

  async changePassword(userId: string, request: PasswordChangeRequest): Promise<void> {
    const row = await this.findById(userId)
    if (!row) throw new AuthError('not_found', 'No such user', 404)

    if (row.passwordHash) {
      const current = request.currentPassword ?? ''
      if (!(await Bun.password.verify(current, row.passwordHash))) {
        throw new AuthError('invalid_password', 'Current password is incorrect', 403)
      }
    }

    await this.db
      .update(users)
      .set({
        passwordHash: await Bun.password.hash(request.newPassword, ARGON2),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
  }

  /** Links an OIDC identity to an account, creating one if the email is unknown. */
  async upsertFromOidc(claims: {
    subject: string
    email: string
    name: string
    avatarUrl?: string | null
    isAdmin: boolean
  }): Promise<UserRow> {
    const [bySubject] = await this.db
      .select()
      .from(users)
      .where(eq(users.oidcSubject, claims.subject))
      .limit(1)
    if (bySubject) return bySubject

    const byEmail = await this.findByEmail(claims.email)
    if (byEmail) {
      const [linked] = await this.db
        .update(users)
        .set({ oidcSubject: claims.subject, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id))
        .returning()
      return linked!
    }

    const isFirstUser = (await this.countUsers()) === 0
    const [created] = await this.db
      .insert(users)
      .values({
        email: claims.email,
        name: claims.name,
        oidcSubject: claims.subject,
        avatarUrl: claims.avatarUrl ?? null,
        role: claims.isAdmin || isFirstUser ? 'admin' : 'user',
      })
      .returning()
    return created!
  }
}
