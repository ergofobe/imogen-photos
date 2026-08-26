import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from './schema.ts'

export type Database = ReturnType<typeof createDatabase>

export function createDatabase(url: string) {
  const client = new SQL(url)
  return drizzle({ client, schema, casing: 'snake_case' })
}

export * from './schema.ts'
export { schema }
