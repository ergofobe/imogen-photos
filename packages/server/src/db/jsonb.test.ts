import { afterAll, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { createTestDatabase } from '../test/harness.ts'
import { assets, jobs, oauthClients, users } from './schema.ts'

const harness = await createTestDatabase()
const db = harness.db

afterAll(() => harness.close())

/**
 * Double-encoded jsonb round-trips cleanly through the ORM, so reading a value back with
 * drizzle proves nothing. These tests ask Postgres what it actually stored, which is the
 * only way to catch the encoding going wrong again.
 */
describe('jsonb columns store real JSON objects', () => {
  test('asset exif is queryable from inside Postgres', async () => {
    const [user] = await db.insert(users).values({ email: 'j@example.com', name: 'J' }).returning()
    await db.insert(assets).values({
      ownerId: user!.id,
      type: 'image',
      status: 'ready',
      originalFilename: 'a.jpg',
      mimeType: 'image/jpeg',
      checksum: '1'.repeat(64),
      sizeBytes: 1,
      originalPath: 'x',
      capturedAt: new Date(),
      exif: { make: 'Fujifilm', model: 'X100V' },
    })

    const rows = await db.execute<{ kind: string; make: string | null }>(
      sql`select jsonb_typeof(${assets.exif}) as kind, ${assets.exif}->>'make' as make from ${assets}`,
    )
    const row = (Array.isArray(rows) ? rows[0] : (rows as { rows: unknown[] }).rows[0]) as {
      kind: string
      make: string | null
    }

    expect(row.kind).toBe('object')
    expect(row.make).toBe('Fujifilm')
  })

  test('a job payload is queryable from inside Postgres', async () => {
    await db.insert(jobs).values({ name: 'test', payload: { assetId: 'abc-123' } })

    const rows = await db.execute<{ kind: string; asset: string | null }>(
      sql`select jsonb_typeof(${jobs.payload}) as kind, ${jobs.payload}->>'assetId' as asset from ${jobs}`,
    )
    const row = (Array.isArray(rows) ? rows[0] : (rows as { rows: unknown[] }).rows[0]) as {
      kind: string
      asset: string | null
    }

    expect(row.kind).toBe('object')
    expect(row.asset).toBe('abc-123')
  })

  test('a jsonb array is stored as an array, not as a string', async () => {
    await db.insert(oauthClients).values({
      id: 'client-1',
      name: 'Test',
      redirectUris: ['https://a.example.com/cb', 'https://b.example.com/cb'],
      grantTypes: ['authorization_code'],
      scopes: ['library:read'],
    })

    const rows = await db.execute<{ kind: string; count: number }>(
      sql`select jsonb_typeof(${oauthClients.redirectUris}) as kind,
                 jsonb_array_length(${oauthClients.redirectUris}) as count
          from ${oauthClients}`,
    )
    const row = (Array.isArray(rows) ? rows[0] : (rows as { rows: unknown[] }).rows[0]) as {
      kind: string
      count: number
    }

    expect(row.kind).toBe('array')
    expect(Number(row.count)).toBe(2)
  })
})
