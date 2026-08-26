import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQL } from 'bun'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const db = drizzle({ client: new SQL(url) })

// pgvector must exist before the migration that creates the embedding column.
await db.execute(sql`create extension if not exists vector`)
await migrate(db, {
  migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '../../drizzle'),
})
console.log('migrations applied')
process.exit(0)
