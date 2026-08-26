import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { settings } from '../db/schema.ts'

/**
 * Settings an administrator can change while the server is running.
 *
 * Each has an environment variable behind it that used to be the only way to set it.
 * The stored value wins when there is one, so a deployment that sets nothing keeps
 * behaving exactly as it always did, and one that sets an env var still gets that
 * until somebody changes it here on purpose.
 *
 * Values are stored as objects rather than bare scalars. Bun's driver serialises what
 * is bound to a jsonb parameter, and a bare `true` does not survive the round trip in
 * a form `jsonb_typeof` agrees with — the same reason the custom `json` column type
 * exists in the schema.
 */
export class SettingsService {
  constructor(
    private readonly db: Database,
    private readonly defaults: { allowSignup: boolean; trashRetentionDays: number },
  ) {}

  async allowSignup(): Promise<boolean> {
    return (await this.read<boolean>('auth.allowSignup')) ?? this.defaults.allowSignup
  }

  async trashRetentionDays(): Promise<number> {
    return (await this.read<number>('trash.retentionDays')) ?? this.defaults.trashRetentionDays
  }

  async all(): Promise<{ allowSignup: boolean; trashRetentionDays: number }> {
    const rows = await this.db
      .select()
      .from(settings)
      .where(inArray(settings.key, ['auth.allowSignup', 'trash.retentionDays']))
    const stored = new Map(rows.map((row) => [row.key, row.value?.value]))

    return {
      allowSignup:
        (stored.get('auth.allowSignup') as boolean | undefined) ?? this.defaults.allowSignup,
      trashRetentionDays:
        (stored.get('trash.retentionDays') as number | undefined) ??
        this.defaults.trashRetentionDays,
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db
      .insert(settings)
      .values({ key, value: { value } })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: { value }, updatedAt: new Date() },
      })
  }

  private async read<T>(key: string): Promise<T | null> {
    const [row] = await this.db.select().from(settings).where(eq(settings.key, key)).limit(1)
    return (row?.value?.value as T | undefined) ?? null
  }
}
