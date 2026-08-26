import { and, eq, isNotNull, lte, sql } from 'drizzle-orm'
import type { SessionService } from '../auth/sessions.ts'
import type { Database } from '../db/index.ts'
import { assetFiles, assets, uploadSessions, users } from '../db/schema.ts'
import type { Config } from '../lib/config.ts'
import type { LocalStorage } from '../media/storage.ts'
import type { JobQueue } from './queue.ts'

export const SWEEP_TRASH_JOB = 'maintenance.sweepTrash'
export const PRUNE_UPLOADS_JOB = 'maintenance.pruneUploads'
export const PRUNE_JOBS_JOB = 'maintenance.pruneJobs'

export type MaintenanceDeps = {
  db: Database
  config: Config
  library: LocalStorage
  thumbnails: LocalStorage
  sessions: SessionService
}

export function registerMaintenanceJobs(queue: JobQueue, deps: MaintenanceDeps): void {
  queue.register(SWEEP_TRASH_JOB, async () => {
    await sweepTrash(deps)
  })
  queue.register(PRUNE_UPLOADS_JOB, async () => {
    await pruneUploads(deps)
  })
  queue.register(PRUNE_JOBS_JOB, async () => {
    await queue.pruneCompleted(7)
    await deps.sessions.pruneExpired()
  })
}

/**
 * Permanently removes assets that have been in the trash past the retention window.
 * Files go first: a row without its bytes is a broken thumbnail, but bytes without a row
 * are invisible garbage that nothing will ever clean up.
 */
export async function sweepTrash(deps: MaintenanceDeps): Promise<number> {
  const cutoff = new Date(Date.now() - deps.config.trashRetentionDays * 24 * 60 * 60 * 1000)
  const doomed = await deps.db
    .select({ id: assets.id, ownerId: assets.ownerId, sizeBytes: assets.sizeBytes })
    .from(assets)
    .where(and(isNotNull(assets.deletedAt), lte(assets.deletedAt, cutoff)))
    .limit(500)

  for (const asset of doomed) {
    const files = await deps.db.select().from(assetFiles).where(eq(assetFiles.assetId, asset.id))

    for (const file of files) {
      const store = file.variant === 'original' ? deps.library : deps.thumbnails
      await store.remove(file.path).catch(() => {})
    }

    await deps.db.delete(assets).where(eq(assets.id, asset.id))
    await deps.db
      .update(users)
      .set({ usedBytes: sql`greatest(${users.usedBytes} - ${asset.sizeBytes}, 0)` })
      .where(eq(users.id, asset.ownerId))
  }

  return doomed.length
}

/** Drops abandoned resumable uploads and the partial files they were writing. */
export async function pruneUploads(deps: MaintenanceDeps): Promise<number> {
  const stale = await deps.db
    .select()
    .from(uploadSessions)
    .where(lte(uploadSessions.expiresAt, new Date()))
    .limit(500)

  for (const session of stale) {
    await Bun.file(session.tempPath)
      .delete()
      .catch(() => {})
    await deps.db.delete(uploadSessions).where(eq(uploadSessions.id, session.id))
  }
  return stale.length
}

/** Queues the recurring chores. Called once at boot. */
export async function scheduleMaintenance(queue: JobQueue): Promise<void> {
  const hourly = new Date(Date.now() + 60_000)
  await queue.enqueue(SWEEP_TRASH_JOB, {}, { runAt: hourly })
  await queue.enqueue(PRUNE_UPLOADS_JOB, {}, { runAt: hourly })
  await queue.enqueue(PRUNE_JOBS_JOB, {}, { runAt: hourly })
}
