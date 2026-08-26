import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { users } from '../db/schema.ts'
import { createTestDatabase } from '../test/harness.ts'
import { AccountService, AuthError } from './accounts.ts'

const harness = await createTestDatabase()
const db: Database = harness.db
const accounts = new AccountService(db, { allowSignup: async () => true })

afterAll(() => harness.close())

beforeEach(async () => {
  await db.execute(sql`truncate users cascade`)
})

async function nativeUser(email = 'owner@example.com') {
  return accounts.signup({ email, password: 'a-sufficiently-long-password', name: 'Owner' })
}

async function ssoUser() {
  return accounts.upsertFromOidc({
    subject: 'sub-1',
    email: 'sso@example.com',
    name: 'From Authentik',
    isAdmin: false,
  })
}

describe('editing a native account', () => {
  test('changes the display name', async () => {
    const user = await nativeUser()

    const updated = await accounts.updateProfile(user.id, { name: 'Jim' })

    expect(updated.name).toBe('Jim')
  })

  test('changes the email address when the password is given', async () => {
    const user = await nativeUser()

    const updated = await accounts.updateProfile(user.id, {
      email: 'new@example.com',
      currentPassword: 'a-sufficiently-long-password',
    })

    expect(updated.email).toBe('new@example.com')
    expect(
      await accounts.verifyPassword('new@example.com', 'a-sufficiently-long-password'),
    ).not.toBeNull()
  })

  /** Otherwise a borrowed unlocked laptop is enough to take the account over. */
  test('refuses an email change without the current password', async () => {
    const user = await nativeUser()

    await expect(accounts.updateProfile(user.id, { email: 'new@example.com' })).rejects.toThrow(
      AuthError,
    )
  })

  test('refuses an email change with the wrong password', async () => {
    const user = await nativeUser()

    await expect(
      accounts.updateProfile(user.id, { email: 'new@example.com', currentPassword: 'wrong' }),
    ).rejects.toThrow(AuthError)
  })

  test('does not require a password merely to change the name', async () => {
    const user = await nativeUser()

    const updated = await accounts.updateProfile(user.id, { name: 'Just A Name' })

    expect(updated.name).toBe('Just A Name')
  })

  test('refuses an email another account already uses', async () => {
    await nativeUser('taken@example.com')
    const user = await nativeUser('mine@example.com')

    await expect(
      accounts.updateProfile(user.id, {
        email: 'taken@example.com',
        currentPassword: 'a-sufficiently-long-password',
      }),
    ).rejects.toThrow(AuthError)
  })

  test('refuses an email that differs from another only by case', async () => {
    await nativeUser('Taken@Example.com')
    const user = await nativeUser('mine@example.com')

    await expect(
      accounts.updateProfile(user.id, {
        email: 'taken@example.com',
        currentPassword: 'a-sufficiently-long-password',
      }),
    ).rejects.toThrow(AuthError)
  })

  test('lets you re-save your own address unchanged', async () => {
    const user = await nativeUser('mine@example.com')

    const updated = await accounts.updateProfile(user.id, {
      email: 'mine@example.com',
      currentPassword: 'a-sufficiently-long-password',
    })

    expect(updated.email).toBe('mine@example.com')
  })
})

describe('an account owned by an identity provider', () => {
  test('cannot have its name changed here', async () => {
    const user = await ssoUser()

    await expect(accounts.updateProfile(user.id, { name: 'Something Else' })).rejects.toThrow(
      /identity provider/i,
    )
  })

  test('cannot have its email changed here', async () => {
    const user = await ssoUser()

    await expect(accounts.updateProfile(user.id, { email: 'other@example.com' })).rejects.toThrow(
      /identity provider/i,
    )
  })

  /** The provider is the source of truth, so a rename there must land here. */
  test('picks up a name change from the provider at the next sign-in', async () => {
    await ssoUser()

    const updated = await accounts.upsertFromOidc({
      subject: 'sub-1',
      email: 'sso@example.com',
      name: 'Renamed In Authentik',
      isAdmin: false,
    })

    expect(updated.name).toBe('Renamed In Authentik')
  })

  test('picks up an email change from the provider at the next sign-in', async () => {
    await ssoUser()

    const updated = await accounts.upsertFromOidc({
      subject: 'sub-1',
      email: 'moved@example.com',
      name: 'From Authentik',
      isAdmin: false,
    })

    expect(updated.email).toBe('moved@example.com')
  })

  test('grants and removes administrator as the provider group changes', async () => {
    await ssoUser()
    const base = { subject: 'sub-1', email: 'sso@example.com', name: 'From Authentik' }

    const promoted = await accounts.upsertFromOidc({
      ...base,
      isAdmin: true,
      adminMappingConfigured: true,
    })
    expect(promoted.role).toBe('admin')

    const demoted = await accounts.upsertFromOidc({
      ...base,
      isAdmin: false,
      adminMappingConfigured: true,
    })
    expect(demoted.role).toBe('user')
  })

  /**
   * Without a group mapping every sign-in reports isAdmin: false. Syncing the role then
   * would demote the administrator on their next login — including the only one.
   */
  test('does not touch the role when no admin group is configured', async () => {
    const user = await ssoUser()
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id))

    const after = await accounts.upsertFromOidc({
      subject: 'sub-1',
      email: 'sso@example.com',
      name: 'From Authentik',
      isAdmin: false,
    })

    expect(after.role).toBe('admin')
  })

  test('an account linked to a provider reports it, so the UI can say why', async () => {
    const user = await ssoUser()

    const [row] = await db.select().from(users).where(eq(users.id, user.id))
    expect(row!.oidcSubject).toBe('sub-1')
    expect(row!.passwordHash).toBeNull()
  })
})
