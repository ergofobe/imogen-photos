import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { assets, users } from '../db/schema.ts'
import { createTestDatabase } from '../test/harness.ts'
import { AssetService } from './assets.ts'

const harness = await createTestDatabase()
const db: Database = harness.db
const service = new AssetService(db)

afterAll(() => harness.close())

let ownerId: string
let otherId: string

beforeEach(async () => {
  await db.execute(sql`truncate assets, users cascade`)
  const rows = await db
    .insert(users)
    .values([
      { email: 'owner@example.com', name: 'Owner' },
      { email: 'other@example.com', name: 'Other' },
    ])
    .returning()
  ownerId = rows[0]!.id
  otherId = rows[1]!.id
})

let counter = 0
async function addAsset(overrides: Partial<typeof assets.$inferInsert> = {}) {
  counter++
  const [row] = await db
    .insert(assets)
    .values({
      ownerId,
      type: 'image',
      status: 'ready',
      originalFilename: `photo-${counter}.jpg`,
      mimeType: 'image/jpeg',
      checksum: counter.toString(16).padStart(64, '0'),
      sizeBytes: 1000,
      originalPath: `x/${counter}.jpg`,
      capturedAt: new Date(`2024-01-${String((counter % 28) + 1).padStart(2, '0')}T12:00:00Z`),
      ...overrides,
    })
    .returning()
  return row!
}

describe('listing', () => {
  test('returns only the caller’s own assets', async () => {
    await addAsset()
    await addAsset({ ownerId: otherId, checksum: 'f'.repeat(64) })

    const page = await service.list(ownerId, { limit: 100, sort: 'capturedAt', order: 'desc' })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.ownerId).toBe(ownerId)
  })

  test('sorts newest first by capture time', async () => {
    await addAsset({ capturedAt: new Date('2020-01-01T00:00:00Z') })
    await addAsset({ capturedAt: new Date('2024-06-01T00:00:00Z') })
    await addAsset({ capturedAt: new Date('2022-03-01T00:00:00Z') })

    const page = await service.list(ownerId, { limit: 100, sort: 'capturedAt', order: 'desc' })

    expect(page.items.map((a) => a.capturedAt.slice(0, 4))).toEqual(['2024', '2022', '2020'])
  })

  test('hides trashed assets by default', async () => {
    await addAsset()
    await addAsset({ deletedAt: new Date() })

    const page = await service.list(ownerId, { limit: 100, sort: 'capturedAt', order: 'desc' })

    expect(page.items).toHaveLength(1)
  })

  test('shows only trashed assets when asked', async () => {
    await addAsset()
    const trashed = await addAsset({ deletedAt: new Date() })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      trashed: true,
    })

    expect(page.items.map((a) => a.id)).toEqual([trashed.id])
  })

  test('hides archived assets from the main timeline', async () => {
    await addAsset()
    await addAsset({ archived: true })

    const page = await service.list(ownerId, { limit: 100, sort: 'capturedAt', order: 'desc' })

    expect(page.items).toHaveLength(1)
  })

  test('filters by favourite', async () => {
    await addAsset()
    const favourite = await addAsset({ favorite: true })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      favorite: true,
    })

    expect(page.items.map((a) => a.id)).toEqual([favourite.id])
  })

  test('filters by media type', async () => {
    await addAsset()
    const video = await addAsset({ type: 'video', mimeType: 'video/mp4' })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      type: 'video',
    })

    expect(page.items.map((a) => a.id)).toEqual([video.id])
  })

  test('filters by capture date range', async () => {
    await addAsset({ capturedAt: new Date('2020-05-05T00:00:00Z') })
    const inRange = await addAsset({ capturedAt: new Date('2023-05-05T00:00:00Z') })
    await addAsset({ capturedAt: new Date('2025-05-05T00:00:00Z') })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      takenAfter: '2023-01-01T00:00:00.000Z',
      takenBefore: '2024-01-01T00:00:00.000Z',
    })

    expect(page.items.map((a) => a.id)).toEqual([inRange.id])
  })
})

describe('cursor pagination', () => {
  test('walks the whole library exactly once', async () => {
    for (let i = 0; i < 25; i++) {
      await addAsset({ capturedAt: new Date(Date.UTC(2024, 0, 1, 0, 0, i)) })
    }

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: Awaited<ReturnType<typeof service.list>> = await service.list(ownerId, {
        limit: 10,
        sort: 'capturedAt',
        order: 'desc',
        ...(cursor ? { cursor } : {}),
      })
      seen.push(...page.items.map((a) => a.id))
      cursor = page.nextCursor
    } while (cursor)

    expect(seen).toHaveLength(25)
    expect(new Set(seen).size).toBe(25)
  })

  test('does not skip or repeat when assets share a capture time', async () => {
    const sameMoment = new Date('2024-02-02T10:00:00Z')
    for (let i = 0; i < 12; i++) await addAsset({ capturedAt: sameMoment })

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: Awaited<ReturnType<typeof service.list>> = await service.list(ownerId, {
        limit: 5,
        sort: 'capturedAt',
        order: 'desc',
        ...(cursor ? { cursor } : {}),
      })
      seen.push(...page.items.map((a) => a.id))
      cursor = page.nextCursor
    } while (cursor)

    expect(new Set(seen).size).toBe(12)
  })

  test('reports no next cursor on the final page', async () => {
    await addAsset()
    await addAsset()

    const page = await service.list(ownerId, { limit: 10, sort: 'capturedAt', order: 'desc' })

    expect(page.nextCursor).toBeNull()
  })

  test('an upload during paging does not shift the pages already read', async () => {
    for (let i = 0; i < 10; i++) {
      await addAsset({ capturedAt: new Date(Date.UTC(2024, 0, 1, 0, 0, i)) })
    }
    const first = await service.list(ownerId, { limit: 5, sort: 'capturedAt', order: 'desc' })

    // Something newer arrives between pages, as it would mid-scroll.
    await addAsset({ capturedAt: new Date(Date.UTC(2030, 0, 1)) })

    const second = await service.list(ownerId, {
      limit: 5,
      sort: 'capturedAt',
      order: 'desc',
      cursor: first.nextCursor!,
    })

    const overlap = second.items.filter((a) => first.items.some((f) => f.id === a.id))
    expect(overlap).toBeEmpty()
  })
})

describe('search', () => {
  test('matches on filename', async () => {
    await addAsset({ originalFilename: 'harbour-sunset.jpg' })
    await addAsset({ originalFilename: 'tax-return.jpg' })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      q: 'harbour',
    })

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.originalFilename).toBe('harbour-sunset.jpg')
  })

  test('matches on description', async () => {
    const described = await addAsset({ description: 'The dog wearing a party hat' })
    await addAsset({ description: 'A spreadsheet' })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      q: 'dog',
    })

    expect(page.items.map((a) => a.id)).toEqual([described.id])
  })

  test('matches on camera model', async () => {
    const shot = await addAsset({ exif: { make: 'Fujifilm', model: 'X100V' } })
    await addAsset({ exif: { make: 'Apple', model: 'iPhone 15' } })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      q: 'Fujifilm',
    })

    expect(page.items.map((a) => a.id)).toEqual([shot.id])
  })

  test('never leaks another user’s assets through search', async () => {
    await addAsset({
      ownerId: otherId,
      originalFilename: 'secret-harbour.jpg',
      checksum: 'a'.repeat(64),
    })

    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      q: 'harbour',
    })

    expect(page.items).toBeEmpty()
  })

  test('treats punctuation as harmless rather than as query syntax', async () => {
    await addAsset({ originalFilename: 'holiday.jpg' })

    // A raw tsquery would reject these; the service must not hand user text to to_tsquery.
    const page = await service.list(ownerId, {
      limit: 100,
      sort: 'capturedAt',
      order: 'desc',
      q: 'holiday & | ! ( ) :*',
    })

    expect(page.items).toHaveLength(1)
  })
})

describe('mutation', () => {
  test('updates favourite and description', async () => {
    const asset = await addAsset()

    const updated = await service.update(ownerId, asset.id, {
      favorite: true,
      description: 'A very good dog',
    })

    expect(updated.favorite).toBe(true)
    expect(updated.description).toBe('A very good dog')
  })

  test('refuses to update another user’s asset', async () => {
    const asset = await addAsset({ ownerId: otherId, checksum: 'b'.repeat(64) })

    await expect(service.update(ownerId, asset.id, { favorite: true })).rejects.toThrow()
  })

  test('trashing sets a deletion time rather than destroying the row', async () => {
    const asset = await addAsset()

    await service.trash(ownerId, [asset.id])

    const [row] = await db.select().from(assets)
    expect(row!.deletedAt).not.toBeNull()
  })

  test('restoring clears the deletion time', async () => {
    const asset = await addAsset({ deletedAt: new Date() })

    await service.restore(ownerId, [asset.id])

    const [row] = await db.select().from(assets)
    expect(row!.deletedAt).toBeNull()
  })

  test('trashing another user’s asset does nothing', async () => {
    const asset = await addAsset({ ownerId: otherId, checksum: 'c'.repeat(64) })

    await service.trash(ownerId, [asset.id])

    const [row] = await db.select().from(assets)
    expect(row!.deletedAt).toBeNull()
  })
})

describe('timeline buckets', () => {
  test('counts assets per day, newest first', async () => {
    await addAsset({ capturedAt: new Date('2024-03-01T09:00:00Z') })
    await addAsset({ capturedAt: new Date('2024-03-01T18:00:00Z') })
    await addAsset({ capturedAt: new Date('2024-03-05T12:00:00Z') })

    const buckets = await service.timeline(ownerId)

    expect(buckets).toEqual([
      { date: '2024-03-05', count: 1 },
      { date: '2024-03-01', count: 2 },
    ])
  })

  test('excludes trashed assets from the buckets', async () => {
    await addAsset({ capturedAt: new Date('2024-03-01T09:00:00Z') })
    await addAsset({ capturedAt: new Date('2024-03-01T10:00:00Z'), deletedAt: new Date() })

    const buckets = await service.timeline(ownerId)

    expect(buckets).toEqual([{ date: '2024-03-01', count: 1 }])
  })
})

describe('statistics', () => {
  test('summarises the library', async () => {
    await addAsset({ sizeBytes: 100, capturedAt: new Date('2020-01-01T00:00:00Z') })
    await addAsset({
      sizeBytes: 200,
      type: 'video',
      favorite: true,
      capturedAt: new Date('2024-01-01T00:00:00Z'),
    })
    await addAsset({ sizeBytes: 400, deletedAt: new Date() })

    const stats = await service.stats(ownerId)

    expect(stats.assetCount).toBe(2)
    expect(stats.imageCount).toBe(1)
    expect(stats.videoCount).toBe(1)
    expect(stats.favoriteCount).toBe(1)
    expect(stats.trashedCount).toBe(1)
    expect(stats.storageBytes).toBe(300)
    expect(stats.earliestCapturedAt).toStartWith('2020-01-01')
  })
})
