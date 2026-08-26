import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { AppEnv } from '../auth/middleware.ts'
import { assetFiles } from '../db/schema.ts'
import { notFound } from '../lib/errors.ts'

/**
 * Public album shares. These endpoints are deliberately unauthenticated — the slug is
 * the credential — so every one of them resolves the share first and serves only what
 * that share contains.
 */
export function createShareRoutes() {
  const app = new Hono<AppEnv>()

  app.get('/:slug', async (c) => {
    const services = c.get('services')
    const share = await services.albums.resolveShare(c.req.param('slug'), c.req.query('password'))
    if (!share) throw notFound('This link is not valid, or it has expired')
    if (share.locked) return c.json({ locked: true }, 401)
    return c.json({ locked: false, album: share.album, allowDownload: share.link.allowDownload })
  })

  app.get('/:slug/assets/:assetId/:variant{preview|thumbnail|original}', async (c) => {
    const services = c.get('services')
    const variant = c.req.param('variant') as 'preview' | 'thumbnail' | 'original'

    const share = await services.albums.resolveShare(c.req.param('slug'), c.req.query('password'))
    if (!share || share.locked) throw notFound('This link is not valid, or it has expired')
    if (variant === 'original' && !share.link.allowDownload) {
      throw notFound('Downloads are not enabled for this link')
    }

    // The asset must belong to the shared album. Otherwise a valid slug would be a
    // key to the whole library.
    const assetId = c.req.param('assetId')
    if (!share.album.assets.some((a) => a.id === assetId)) {
      throw notFound('That photo is not part of this album')
    }

    const files = await services.db.select().from(assetFiles).where(eq(assetFiles.assetId, assetId))
    const file = files.find((f) => f.variant === variant)
    if (!file) throw notFound(`No ${variant} exists for that photo`)

    const store = variant === 'original' ? services.library : services.thumbnails
    return new Response(await store.read(file.path), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.sizeBytes),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  })

  return app
}
