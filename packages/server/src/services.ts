import { AccountService } from './auth/accounts.ts'
import { OAuthService } from './auth/oauth.ts'
import { OidcService } from './auth/oidc.ts'
import { SessionService } from './auth/sessions.ts'
import { createDatabase, type Database } from './db/index.ts'
import { registerMaintenanceJobs } from './jobs/maintenance.ts'
import { JobQueue } from './jobs/queue.ts'
import type { Config } from './lib/config.ts'
import { AlbumService } from './media/albums.ts'
import { AssetService } from './media/assets.ts'
import { INGEST_JOB, IngestService } from './media/ingest.ts'
import { MediaPipeline } from './media/pipeline.ts'
import { LocalStorage } from './media/storage.ts'
import { VaultService } from './vault/vault.ts'

export type Services = {
  config: Config
  db: Database
  queue: JobQueue
  accounts: AccountService
  sessions: SessionService
  oauth: OAuthService
  oidc: OidcService | null
  assets: AssetService
  albums: AlbumService
  vault: VaultService
  ingest: IngestService
  library: LocalStorage
  thumbnails: LocalStorage
  shutdown: () => Promise<void>
}

export function createServices(config: Config, database?: Database): Services {
  const db = database ?? createDatabase(config.databaseUrl)

  const library = new LocalStorage(config.libraryDir)
  const thumbnails = new LocalStorage(config.thumbsDir)
  const pipeline = new MediaPipeline({
    ffmpegPath: config.ffmpegPath,
    ffprobePath: config.ffprobePath,
    heifDecPath: config.heifDecPath,
  })
  const queue = new JobQueue(db, { concurrency: config.jobConcurrency })

  const accounts = new AccountService(db, { allowSignup: config.allowSignup })
  const sessions = new SessionService(db)
  const oauth = new OAuthService(db, { publicUrl: config.publicUrl })
  const oidc = config.oidc
    ? new OidcService(config.oidc, `${config.publicUrl}/api/v1/auth/oidc/callback`)
    : null

  const assets = new AssetService(db)
  const albums = new AlbumService(db)
  const vault = new VaultService(db, { secret: config.secret })
  const ingest = new IngestService(db, library, thumbnails, pipeline, (name, payload) =>
    queue.enqueue(name, payload),
  )

  queue.register(INGEST_JOB, async (payload) => {
    const assetId = payload.assetId
    if (typeof assetId !== 'string') throw new Error('ingest job needs an assetId')
    await ingest.process(assetId)
  })
  registerMaintenanceJobs(queue, { db, config, library, thumbnails, sessions })

  return {
    config,
    db,
    queue,
    accounts,
    sessions,
    oauth,
    oidc,
    assets,
    albums,
    vault,
    ingest,
    library,
    thumbnails,
    shutdown: async () => {
      await queue.stop()
      await db.$client.end()
    },
  }
}
