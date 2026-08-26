import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import type { Sharp } from 'sharp'
import sharp from 'sharp'
import type { Database } from '../db/index.ts'
import { assets, faces, people, users } from '../db/schema.ts'
import { createTestConfig, createTestDatabase, removeTestConfig } from '../test/harness.ts'
import { FaceService } from './faces.ts'
import { ModelStore } from './models.ts'

const harness = await createTestDatabase()
const db: Database = harness.db
const config = createTestConfig()

/**
 * The models are 190 MB and are downloaded onto a server when someone enables the
 * feature, not committed here. A checkout without them skips these tests rather than
 * failing: everything they cover is exercised in CI once the fixtures exist locally.
 */
const FIXTURE_MODELS = join(
  process.env.IMOGEN_TEST_MODELS ?? join(process.env.HOME ?? '', '.cache/imogen-test-models'),
)
const store = new ModelStore(FIXTURE_MODELS)
const modelsPresent = await store.isReady()

/** Portraits of three different people, plus altered copies of each. */
const FACE_FIXTURES =
  process.env.IMOGEN_TEST_FACES ?? join(process.env.HOME ?? '', '.cache/imogen-test-faces')
const facesPresent = existsSync(join(FACE_FIXTURES, 'person-a.png'))

const canRun = modelsPresent && facesPresent

const service = new FaceService(db, store, (p) => join(config.libraryDir, p))

afterAll(async () => {
  await harness.close()
  removeTestConfig(config)
})

let ownerId: string

beforeAll(async () => {
  await mkdir(config.libraryDir, { recursive: true })
})

beforeEach(async () => {
  await db.execute(sql`truncate users, assets, faces, people, settings cascade`)
  const [user] = await db
    .insert(users)
    .values({ email: 'owner@example.com', name: 'Owner' })
    .returning()
  ownerId = user!.id
  await service.setEnabled(true)
})

let counter = 0

/** Copies a fixture into the library and registers it as an asset. */
async function addPhoto(
  fixture: string,
  transform?: (image: Sharp) => Sharp,
  overrides: Partial<typeof assets.$inferInsert> = {},
) {
  counter++
  const relative = `${ownerId}/${counter}.png`
  const absolute = join(config.libraryDir, relative)
  await mkdir(join(config.libraryDir, ownerId), { recursive: true })

  const base = sharp(join(FACE_FIXTURES, fixture))
  await (transform ? transform(base) : base).toFile(absolute)

  const [row] = await db
    .insert(assets)
    .values({
      ownerId,
      type: 'image',
      status: 'ready',
      originalFilename: `${counter}.png`,
      mimeType: 'image/png',
      checksum: counter.toString(16).padStart(64, '0'),
      sizeBytes: 1000,
      originalPath: relative,
      capturedAt: new Date(),
      ...overrides,
    })
    .returning()
  return row!
}

describe.skipIf(!canRun)('detecting faces', () => {
  test('finds the face in a portrait', async () => {
    const asset = await addPhoto('person-a.png')

    const found = await service.processAsset(asset.id)

    expect(found).toBe(1)
    expect(await service.facesForAsset(ownerId, asset.id)).toHaveLength(1)
  })

  test('records where the face is, in the original’s pixels', async () => {
    const asset = await addPhoto('person-a.png')
    await service.processAsset(asset.id)

    const [face] = await service.facesForAsset(ownerId, asset.id)

    expect(face!.width).toBeGreaterThan(48)
    expect(face!.height).toBeGreaterThan(48)
    expect(face!.score).toBeGreaterThan(0.65)
  })

  test('a photo with no faces is not scanned again on the next pass', async () => {
    counter++
    const relative = `${ownerId}/empty.png`
    await mkdir(join(config.libraryDir, ownerId), { recursive: true })
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 80, b: 50 } },
    })
      .png()
      .toFile(join(config.libraryDir, relative))
    const [asset] = await db
      .insert(assets)
      .values({
        ownerId,
        type: 'image',
        status: 'ready',
        originalFilename: 'empty.png',
        mimeType: 'image/png',
        checksum: 'e'.repeat(64),
        sizeBytes: 10,
        originalPath: relative,
        capturedAt: new Date(),
      })
      .returning()

    await service.processAsset(asset!.id)

    const [after] = await db.select().from(assets).where(eq(assets.id, asset!.id))
    expect(after!.facesScannedAt).not.toBeNull()
  })

  test('finds nothing in a photograph with no people in it', async () => {
    counter++
    const relative = `${ownerId}/landscape.png`
    await mkdir(join(config.libraryDir, ownerId), { recursive: true })
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 60, g: 110, b: 70 } },
    })
      .png()
      .toFile(join(config.libraryDir, relative))
    const [asset] = await db
      .insert(assets)
      .values({
        ownerId,
        type: 'image',
        status: 'ready',
        originalFilename: 'landscape.png',
        mimeType: 'image/png',
        checksum: 'a'.repeat(64),
        sizeBytes: 10,
        originalPath: relative,
        capturedAt: new Date(),
      })
      .returning()

    expect(await service.processAsset(asset!.id)).toBe(0)
  })

  test('does nothing at all while the feature is off', async () => {
    await service.setEnabled(false)
    const asset = await addPhoto('person-a.png')

    expect(await service.processAsset(asset.id)).toBe(0)
    expect(await db.select().from(faces)).toBeEmpty()
  })

  test('re-processing replaces a photo’s faces rather than duplicating them', async () => {
    const asset = await addPhoto('person-a.png')
    await service.processAsset(asset.id)
    await service.processAsset(asset.id)

    expect(await service.facesForAsset(ownerId, asset.id)).toHaveLength(1)
  })
})

describe.skipIf(!canRun)('grouping faces into people', () => {
  test('groups the same person photographed differently', async () => {
    const a = await addPhoto('person-a.png')
    const b = await addPhoto('person-a.png', (i) => i.modulate({ brightness: 1.3 }))
    const c = await addPhoto('person-a.png', (i) => i.rotate(8, { background: '#fff' }))

    for (const asset of [a, b, c]) await service.processAsset(asset.id)

    const found = await service.listPeople(ownerId)
    expect(found).toHaveLength(1)
    expect(found[0]!.faceCount).toBe(3)
  })

  test('keeps different people apart', async () => {
    for (const fixture of ['person-a.png', 'person-b.png', 'person-c.png']) {
      const asset = await addPhoto(fixture)
      await service.processAsset(asset.id)
    }

    expect(await service.listPeople(ownerId)).toHaveLength(3)
  })

  /** The mistake worth guarding: two people collapsing into one. */
  test('never merges two different people automatically', async () => {
    const shots = ['person-a.png', 'person-a.png', 'person-b.png', 'person-b.png', 'person-c.png']
    for (const fixture of shots) {
      const asset = await addPhoto(fixture, (i) =>
        i.modulate({ brightness: 0.9 + Math.random() * 0.2 }),
      )
      await service.processAsset(asset.id)
    }

    const found = await service.listPeople(ownerId)
    expect(found.length).toBeGreaterThanOrEqual(3)
    // Nobody should have collected faces belonging to two different sitters.
    expect(found.every((p) => p.faceCount <= 2)).toBe(true)
  })

  /**
   * The job queue scans several photos at once. Before the assignment was serialised,
   * four workers each looked for an existing person, each found none yet, and each
   * created one — so three photographs of one face became three different people.
   */
  test('stays one person when several photos are scanned at the same time', async () => {
    // Added one at a time, then scanned all at once — the race is in the scanning.
    const shots = [
      await addPhoto('person-a.png'),
      await addPhoto('person-a.png', (i) => i.modulate({ brightness: 1.2 })),
      await addPhoto('person-a.png', (i) => i.modulate({ brightness: 0.8 })),
      await addPhoto('person-a.png', (i) => i.rotate(6, { background: '#fff' })),
    ]

    await Promise.all(shots.map((asset) => service.processAsset(asset.id)))

    const found = await service.listPeople(ownerId)
    expect(found).toHaveLength(1)
    expect(found[0]!.faceCount).toBe(4)
  })

  /**
   * The housekeeping pass removes people who have no visible photos. Before assignment
   * and storage were atomic, it could remove a person in the moment between their being
   * created and their first face being written — leaving that face attached to nobody.
   */
  test('every stored face belongs to somebody', async () => {
    const shots = [
      await addPhoto('person-a.png'),
      await addPhoto('person-b.png'),
      await addPhoto('person-c.png'),
      await addPhoto('person-a.png', (i) => i.modulate({ brightness: 1.2 })),
      await addPhoto('person-b.png', (i) => i.modulate({ brightness: 0.8 })),
    ]

    await Promise.all(shots.map((asset) => service.processAsset(asset.id)))

    const stored = await db.select().from(faces)
    expect(stored.length).toBeGreaterThan(0)
    expect(stored.every((f) => f.personId !== null)).toBe(true)
  })

  test('lists the photos a person appears in', async () => {
    const a = await addPhoto('person-a.png')
    const b = await addPhoto('person-a.png', (i) => i.modulate({ brightness: 1.2 }))
    for (const asset of [a, b]) await service.processAsset(asset.id)

    const [person] = await service.listPeople(ownerId)
    const photos = await service.photosOf(ownerId, person!.id)

    expect(photos.map((p) => p.id).sort()).toEqual([a.id, b.id].sort())
  })
})

describe.skipIf(!canRun)('correcting the grouping', () => {
  async function twoPeople() {
    const a = await addPhoto('person-a.png')
    const b = await addPhoto('person-b.png')
    for (const asset of [a, b]) await service.processAsset(asset.id)
    return service.listPeople(ownerId)
  }

  test('names a person', async () => {
    const [person] = await twoPeople()

    await service.renamePerson(ownerId, person!.id, 'Anna')

    expect((await service.getPerson(ownerId, person!.id)).name).toBe('Anna')
  })

  test('merges two clusters that were the same person after all', async () => {
    const found = await twoPeople()

    const moved = await service.mergePeople(ownerId, found[0]!.id, [found[1]!.id])

    expect(moved).toBe(1)
    expect(await service.listPeople(ownerId)).toHaveLength(1)
  })

  test('hides a person without losing the grouping', async () => {
    const [person] = await twoPeople()

    await service.setHidden(ownerId, person!.id, true)

    expect((await service.listPeople(ownerId)).map((p) => p.id)).not.toContain(person!.id)
    expect((await service.listPeople(ownerId, true)).map((p) => p.id)).toContain(person!.id)
  })

  test('one account cannot touch another’s people', async () => {
    const [person] = await twoPeople()
    const [other] = await db
      .insert(users)
      .values({ email: 'other@example.com', name: 'Other' })
      .returning()

    await expect(service.renamePerson(other!.id, person!.id, 'Mine')).rejects.toThrow()
  })
})

describe.skipIf(!canRun)('the vault is out of reach', () => {
  test('a vaulted photo is never scanned', async () => {
    const asset = await addPhoto('person-a.png', undefined, { vaultedAt: new Date() })

    expect(await service.processAsset(asset.id)).toBe(0)
    expect(await db.select().from(faces)).toBeEmpty()
  })

  test('vaulting a photo forgets the faces already found in it', async () => {
    const asset = await addPhoto('person-a.png')
    await service.processAsset(asset.id)
    expect(await db.select().from(faces)).toHaveLength(1)

    await db.update(assets).set({ vaultedAt: new Date() }).where(eq(assets.id, asset.id))
    await service.forgetAsset(asset.id, ownerId)

    expect(await db.select().from(faces)).toBeEmpty()
    expect(await service.listPeople(ownerId)).toBeEmpty()
  })

  test('a person’s photos never include a vaulted one', async () => {
    const shown = await addPhoto('person-a.png')
    const hidden = await addPhoto('person-a.png', (i) => i.modulate({ brightness: 1.2 }))
    for (const asset of [shown, hidden]) await service.processAsset(asset.id)

    await db.update(assets).set({ vaultedAt: new Date() }).where(eq(assets.id, hidden.id))

    const [person] = await service.listPeople(ownerId)
    const photos = await service.photosOf(ownerId, person!.id)

    expect(photos.map((p) => p.id)).toEqual([shown.id])
  })

  test('a person who exists only in vaulted photos stops existing', async () => {
    const asset = await addPhoto('person-a.png')
    await service.processAsset(asset.id)

    await db.update(assets).set({ vaultedAt: new Date() }).where(eq(assets.id, asset.id))
    await service.forgetAsset(asset.id, ownerId)

    expect(await db.select().from(people)).toBeEmpty()
  })
})

describe.skipIf(!canRun)('searching by name', () => {
  test('finds a named person', async () => {
    const asset = await addPhoto('person-a.png')
    await service.processAsset(asset.id)
    const [person] = await service.listPeople(ownerId)
    await service.renamePerson(ownerId, person!.id, 'Anna Kowalski')

    expect((await service.findPeopleByName(ownerId, 'anna')).map((p) => p.name)).toEqual([
      'Anna Kowalski',
    ])
  })

  test('does not offer unnamed or hidden people', async () => {
    const asset = await addPhoto('person-a.png')
    await service.processAsset(asset.id)
    const [person] = await service.listPeople(ownerId)

    expect(await service.findPeopleByName(ownerId, '')).toBeEmpty()

    await service.renamePerson(ownerId, person!.id, 'Anna')
    await service.setHidden(ownerId, person!.id, true)
    expect(await service.findPeopleByName(ownerId, 'anna')).toBeEmpty()
  })
})
