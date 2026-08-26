import type { AdminUser } from '@imogen/shared'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { assets, users } from '../db/schema.ts'

/**
 * Server-wide questions, asked by whoever runs the server.
 *
 * Every other service is scoped to one owner and takes their id as its first argument.
 * This one deliberately is not: an administrator's whole job is to see across accounts.
 * The gate that decides who may ask lives in the middleware, not here.
 */
export class AdminService {
  constructor(private readonly db: Database) {}

  /**
   * Every account, with enough about each to act on it.
   *
   * Photo counts come from a left join rather than a query per user, so a server with
   * a hundred accounts still costs one round trip. Trashed photos are left out of the
   * count: they are on their way to being gone, and counting them makes a tidy library
   * look full.
   */
  async users(): Promise<AdminUser[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
        hasOidc: sql<boolean>`${users.oidcSubject} is not null`,
        usedBytes: users.usedBytes,
        quotaBytes: users.quotaBytes,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        photoCount: count(assets.id),
      })
      .from(users)
      .leftJoin(assets, and(eq(assets.ownerId, users.id), isNull(assets.deletedAt)))
      .groupBy(users.id)
      .orderBy(users.createdAt)

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      signsInWith: signsInWith(row.hasPassword, row.hasOidc),
      photoCount: Number(row.photoCount),
      usedBytes: Number(row.usedBytes),
      quotaBytes: row.quotaBytes === null ? null : Number(row.quotaBytes),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }))
  }
}

/** An account can hold both a password and an SSO subject once it has used each. */
function signsInWith(hasPassword: boolean, hasOidc: boolean): AdminUser['signsInWith'] {
  if (hasPassword && hasOidc) return 'both'
  return hasOidc ? 'sso' : 'password'
}
