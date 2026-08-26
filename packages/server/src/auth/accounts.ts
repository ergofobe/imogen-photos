import type { PasswordChangeRequest, ProfileUpdate, SignupRequest, User } from '@imogen/shared'
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

  /**
   * Edits your own name and email.
   *
   * Changing the email address requires the current password, because otherwise a
   * borrowed unlocked session is enough to move the account to an address the real owner
   * does not control. Changing a display name is not worth that friction.
   */
  async updateProfile(userId: string, patch: ProfileUpdate): Promise<User> {
    const row = await this.findById(userId)
    if (!row) throw new AuthError('not_found', 'No such user', 404)

    // An account linked to a provider has its details re-read at every sign-in, so
    // editing them here would be undone silently the next time the user signed in.
    if (row.oidcSubject && (patch.name !== undefined || patch.email !== undefined)) {
      throw new AuthError(
        'managed_by_provider',
        'Your name and email come from your identity provider. Change them there.',
        403,
      )
    }

    const changingEmail =
      patch.email !== undefined && patch.email.toLowerCase() !== row.email.toLowerCase()

    if (changingEmail) {
      if (row.passwordHash) {
        const current = patch.currentPassword ?? ''
        if (!(await Bun.password.verify(current, row.passwordHash))) {
          throw new AuthError(
            'invalid_password',
            'Enter your current password to change your email address',
            403,
          )
        }
      }
      const existing = await this.findByEmail(patch.email!)
      if (existing && existing.id !== userId) {
        throw new AuthError('email_taken', 'That email address is already registered', 409)
      }
    }

    const [updated] = await this.db
      .update(users)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning()
    return toPublicUser(updated!)
  }

  /** Links an OIDC identity to an account, creating one if the email is unknown. */
  async upsertFromOidc(claims: {
    subject: string
    email: string
    name: string
    avatarUrl?: string | null
    isAdmin: boolean
    /**
     * Whether the deployment actually maps a provider group to administrator. Without
     * it `isAdmin` is always false, and syncing the role would demote the administrator
     * every time they signed in — including the last one, locking everybody out.
     */
    adminMappingConfigured?: boolean
  }): Promise<UserRow> {
    const [bySubject] = await this.db
      .select()
      .from(users)
      .where(eq(users.oidcSubject, claims.subject))
      .limit(1)
    if (bySubject) {
      // A rename or a group change in the provider has to land here, otherwise imogen
      // quietly disagrees with the directory it delegates to.
      const [synced] = await this.db
        .update(users)
        .set({
          name: claims.name,
          email: claims.email,
          avatarUrl: claims.avatarUrl ?? bySubject.avatarUrl,
          // Only the provider decides the role when the deployment says it should.
          ...(claims.adminMappingConfigured
            ? { role: claims.isAdmin ? ('admin' as const) : ('user' as const) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, bySubject.id))
        .returning()
      return synced!
    }

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
