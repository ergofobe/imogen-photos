import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { sessions, users } from '../db/schema.ts'
import { createTestDatabase } from '../test/harness.ts'
import { AccountService, AuthError } from './accounts.ts'
import { SessionService } from './sessions.ts'

const harness = await createTestDatabase()
const db: Database = harness.db
const accounts = new AccountService(db, { allowSignup: true })
const sessionSvc = new SessionService(db)

afterAll(() => harness.close())

beforeEach(async () => {
  await db.execute(sql`truncate sessions, users cascade`)
})

describe('account creation', () => {
  test('makes the first account an administrator', async () => {
    const user = await accounts.signup({
      email: 'first@example.com',
      password: 'a-long-enough-password',
      name: 'First',
    })

    expect(user.role).toBe('admin')
  })

  test('makes subsequent accounts ordinary users', async () => {
    await accounts.signup({ email: 'a@example.com', password: 'a-long-password', name: 'A' })

    const second = await accounts.signup({
      email: 'b@example.com',
      password: 'a-long-password',
      name: 'B',
    })

    expect(second.role).toBe('user')
  })

  test('refuses a second signup when signup is disabled', async () => {
    const closed = new AccountService(db, { allowSignup: false })
    await closed.signup({ email: 'a@example.com', password: 'a-long-password', name: 'A' })

    await expect(
      closed.signup({ email: 'b@example.com', password: 'a-long-password', name: 'B' }),
    ).rejects.toThrow(AuthError)
  })

  test('still allows the very first signup when signup is disabled', async () => {
    const closed = new AccountService(db, { allowSignup: false })

    const user = await closed.signup({
      email: 'a@example.com',
      password: 'a-long-password',
      name: 'A',
    })

    expect(user.role).toBe('admin')
  })

  test('rejects an email that differs only by case', async () => {
    await accounts.signup({ email: 'Sam@Example.com', password: 'a-long-password', name: 'Sam' })

    await expect(
      accounts.signup({ email: 'sam@example.com', password: 'a-long-password', name: 'Sam' }),
    ).rejects.toThrow(AuthError)
  })

  test('never stores the password itself', async () => {
    await accounts.signup({ email: 'a@example.com', password: 'hunter2-but-longer', name: 'A' })

    const [row] = await db.select().from(users)
    expect(row!.passwordHash).not.toContain('hunter2')
    expect(row!.passwordHash).toStartWith('$argon2')
  })
})

describe('password verification', () => {
  test('accepts the correct password regardless of email case', async () => {
    await accounts.signup({ email: 'sam@example.com', password: 'a-long-password', name: 'Sam' })

    const user = await accounts.verifyPassword('SAM@EXAMPLE.COM', 'a-long-password')

    expect(user?.email).toBe('sam@example.com')
  })

  test('rejects the wrong password', async () => {
    await accounts.signup({ email: 'sam@example.com', password: 'a-long-password', name: 'Sam' })

    expect(await accounts.verifyPassword('sam@example.com', 'wrong-password')).toBeNull()
  })

  test('rejects an unknown email', async () => {
    expect(await accounts.verifyPassword('nobody@example.com', 'a-long-password')).toBeNull()
  })

  test('rejects any password for an account that has none', async () => {
    const [user] = await db
      .insert(users)
      .values({ email: 'sso@example.com', name: 'SSO', oidcSubject: 'sub-1' })
      .returning()

    expect(await accounts.verifyPassword('sso@example.com', '')).toBeNull()
    expect(user!.passwordHash).toBeNull()
  })
})

describe('sessions', () => {
  async function makeUser() {
    return accounts.signup({ email: 'a@example.com', password: 'a-long-password', name: 'A' })
  }

  test('issues a token that resolves back to its user', async () => {
    const user = await makeUser()

    const { token } = await sessionSvc.create(user.id, {})
    const resolved = await sessionSvc.resolve(token)

    expect(resolved?.userId).toBe(user.id)
  })

  test('stores only the hash of the token', async () => {
    const user = await makeUser()

    const { token } = await sessionSvc.create(user.id, {})

    const [row] = await db.select().from(sessions)
    expect(row!.tokenHash).not.toBe(token)
    expect(row!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
  })

  test('rejects an unknown token', async () => {
    expect(await sessionSvc.resolve('not-a-session')).toBeNull()
  })

  test('rejects an expired session', async () => {
    const user = await makeUser()
    const { token } = await sessionSvc.create(user.id, {})
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) })

    expect(await sessionSvc.resolve(token)).toBeNull()
  })

  test('revoking a session stops it resolving', async () => {
    const user = await makeUser()
    const { token } = await sessionSvc.create(user.id, {})

    await sessionSvc.revoke(token)

    expect(await sessionSvc.resolve(token)).toBeNull()
  })

  test('revoking every session logs out other devices', async () => {
    const user = await makeUser()
    const laptop = await sessionSvc.create(user.id, {})
    const phone = await sessionSvc.create(user.id, {})

    await sessionSvc.revokeAllForUser(user.id)

    expect(await sessionSvc.resolve(laptop.token)).toBeNull()
    expect(await sessionSvc.resolve(phone.token)).toBeNull()
  })

  test('deleting the user removes their sessions', async () => {
    const user = await makeUser()
    await sessionSvc.create(user.id, {})

    await db.delete(users).where(eq(users.id, user.id))

    expect(await db.select().from(sessions)).toBeEmpty()
  })
})

describe('password changes', () => {
  test('requires the current password when one is set', async () => {
    const user = await accounts.signup({
      email: 'a@example.com',
      password: 'a-long-password',
      name: 'A',
    })

    await expect(
      accounts.changePassword(user.id, {
        currentPassword: 'wrong',
        newPassword: 'another-long-one',
      }),
    ).rejects.toThrow(AuthError)
  })

  test('accepts the change with the right current password', async () => {
    const user = await accounts.signup({
      email: 'a@example.com',
      password: 'a-long-password',
      name: 'A',
    })

    await accounts.changePassword(user.id, {
      currentPassword: 'a-long-password',
      newPassword: 'a-brand-new-password',
    })

    expect(await accounts.verifyPassword('a@example.com', 'a-brand-new-password')).not.toBeNull()
    expect(await accounts.verifyPassword('a@example.com', 'a-long-password')).toBeNull()
  })
})
