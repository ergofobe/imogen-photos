import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { createApp } from '../app.ts'
import { createServices } from '../services.ts'
import { createTestConfig, createTestDatabase, removeTestConfig } from '../test/harness.ts'

const harness = await createTestDatabase()
const config = createTestConfig({ publicUrl: 'http://localhost:3000' })
const services = createServices(config, harness.db)
const app = createApp({ services })

afterAll(async () => {
  await harness.close()
  removeTestConfig(config)
})

beforeEach(async () => {
  await harness.db.execute(sql`truncate users, assets, albums, jobs, sessions cascade`)
})

const request = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost:3000${path}`, init))

async function signUp(email: string) {
  const response = await request('/api/v1/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-sufficiently-long-password', name: 'Someone' }),
  })
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''
  return { cookie, user: (await response.json()) as { id: string; role: string } }
}

/**
 * The admin API is meant to be undiscoverable, not merely closed.
 *
 * Every refusal is a plain 404 carrying no hint that the route exists: a 401 or a 403
 * tells whoever is scanning that they have found the administration panel and only
 * need the right account, which is exactly what we are declining to tell them.
 */
describe('hiding the admin API', () => {
  test('an anonymous request is answered as though the route did not exist', async () => {
    const response = await request('/api/v1/admin/users')

    expect(response.status).toBe(404)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('not_found')
  })

  test('a signed-in ordinary user gets the same nothing', async () => {
    await signUp('first@example.com')
    const { cookie, user } = await signUp('second@example.com')
    expect(user.role).toBe('user')

    const response = await request('/api/v1/admin/users', { headers: { Cookie: cookie } })

    expect(response.status).toBe(404)
  })

  test('a refusal never sends the header that advertises how to authenticate', async () => {
    const response = await request('/api/v1/admin/users')

    expect(response.headers.get('WWW-Authenticate')).toBeNull()
  })

  test('the refusal is word for word what an unrouted path returns', async () => {
    const hiddenPath = '/api/v1/admin/users'
    // Outside the admin router entirely, so this is what "nothing here" really sounds
    // like. Comparing two paths under /admin would compare the disguise with itself.
    const absentPath = '/api/v1/nowhere-at-all'

    const hidden = await request(hiddenPath)
    const absent = await request(absentPath)

    expect(hidden.status).toBe(absent.status)

    // Both name the path they were asked for, so they are compared with that one
    // difference taken out. Any wording of its own is the tell: it says something is
    // mounted here and declining, rather than nothing being mounted at all.
    const template = async (response: Response, path: string) =>
      JSON.parse(JSON.stringify(await response.json()).replaceAll(path, '{path}'))

    expect(await template(hidden, hiddenPath)).toEqual(await template(absent, absentPath))
  })

  test('the administrator gets through', async () => {
    const { cookie, user } = await signUp('first@example.com')
    expect(user.role).toBe('admin')

    const response = await request('/api/v1/admin/users', { headers: { Cookie: cookie } })

    expect(response.status).toBe(200)
  })
})

describe('listing accounts', () => {
  test('returns every account on the server, not only the caller', async () => {
    const { cookie } = await signUp('first@example.com')
    await signUp('second@example.com')

    const response = await request('/api/v1/admin/users', { headers: { Cookie: cookie } })
    const body = (await response.json()) as { items: Array<{ email: string; role: string }> }

    expect(body.items.map((u) => u.email).sort()).toEqual([
      'first@example.com',
      'second@example.com',
    ])
  })

  test('never includes anything that could unlock an account', async () => {
    const { cookie } = await signUp('first@example.com')

    const response = await request('/api/v1/admin/users', { headers: { Cookie: cookie } })
    const raw = await response.text()

    expect(raw).not.toContain('passwordHash')
    expect(raw).not.toContain('password_hash')
    expect(raw).not.toContain('vaultPassphraseHash')
  })
})
