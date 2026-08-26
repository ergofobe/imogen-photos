import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQL } from 'bun'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { createDatabase, type Database } from '../db/index.ts'
import type { Config } from '../lib/config.ts'

const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://imogen:imogen@localhost:5432/imogen'

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')

/**
 * Tests run against a real Postgres. The OAuth server's behaviour lives in unique
 * indexes and transactional guards, so a mocked store would test nothing that matters.
 */
export async function createTestDatabase(): Promise<{
  db: Database
  url: string
  close: () => Promise<void>
}> {
  const name = `imogen_test_${crypto.randomUUID().replaceAll('-', '')}`
  const admin = new SQL(ADMIN_URL)
  await admin.unsafe(`create database ${name}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = `/${name}`
  const dbUrl = url.toString()

  const migrator = drizzle({ client: new SQL(dbUrl) })
  await migrator.execute(sql`create extension if not exists vector`)
  await migrate(migrator, { migrationsFolder: MIGRATIONS })

  const db = createDatabase(dbUrl)

  return {
    db,
    url: dbUrl,
    close: async () => {
      await db.$client.end()
      await migrator.$client.end()
      const cleanup = new SQL(ADMIN_URL)
      await cleanup.unsafe(`drop database if exists ${name} with (force)`)
      await cleanup.end()
    },
  }
}

export function createTestConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = mkdtempSync(join(tmpdir(), 'imogen-test-'))
  return {
    port: 0,
    publicUrl: 'https://photos.example.com',
    secret: 'test-secret-that-is-at-least-32-chars-long',
    databaseUrl: 'unused',
    dataDir,
    libraryDir: join(dataDir, 'library'),
    thumbsDir: join(dataDir, 'thumbs'),
    uploadsDir: join(dataDir, 'uploads'),
    allowSignup: true,
    oidc: null,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    jobConcurrency: 1,
    trashRetentionDays: 30,
    ...overrides,
  }
}

export function removeTestConfig(config: Config) {
  rmSync(config.dataDir, { recursive: true, force: true })
}
