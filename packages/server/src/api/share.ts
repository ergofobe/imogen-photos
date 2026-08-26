import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AppEnv } from '../auth/middleware.ts'
import { assetFiles } from '../db/schema.ts'
import { badRequest, notFound, unauthorized } from '../lib/errors.ts'
import type { OpenedShare } from '../media/albums.ts'
import type { Services } from '../services.ts'

const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000

const cookieName = (slug: string) => `imogen_share_${slug}`

/**
 * A password-protected share is unlocked once, by POST, and the proof is kept in an
 * HttpOnly cookie. The password never travels in a URL: URLs end up in access logs,
 * browser history, and Referer headers. A cookie is also the only credential an
 * `<img src>` can carry, since it cannot set a header.
 */
function signUnlock(secret: string, slug: string, expiresAt: number): string {
  const signature = createHmac('sha256', secret).update(`${slug}.${expiresAt}`).digest('base64url')
  return `${expiresAt}.${signature}`
}

function verifyUnlock(secret: string, slug: string, token: string | undefined): boolean {
  if (!token) return false
  const separator = token.indexOf('.')
  if (separator < 1) return false

  const expiresAt = Number(token.slice(0, separator))
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false

  const presented = Buffer.from(token)
  const expected = Buffer.from(signUnlock(secret, slug, expiresAt))
  return presented.length === expected.length && timingSafeEqual(presented, expected)
}

/**
 * Public album shares. These endpoints are deliberately unauthenticated — the slug is
 * the credential — so every one of them resolves the share first and serves only what
 * that share contains.
 */
export function createShareRoutes() {
  const app = new Hono<AppEnv>()

  // A shared page must not leak its slug to whatever the visitor clicks through to.
  app.use('*', async (c, next) => {
    await next()
    c.header('Referrer-Policy', 'no-referrer')
  })

  app.post('/:slug/unlock', async (c) => {
    const services = c.get('services')
    const slug = c.req.param('slug')
    const body = (await c.req.json().catch(() => ({}))) as { password?: unknown }
    if (typeof body.password !== 'string') throw badRequest('A password is required')

    const share = await services.albums.openShare(slug)
    if (!share) throw notFound('This link is not valid, or it has expired')
    if (!(await services.albums.checkSharePassword(slug, body.password))) {
      throw unauthorized('That password is not correct')
    }

    const expiresAt = Date.now() + UNLOCK_TTL_MS
    setCookie(c, cookieName(slug), signUnlock(services.config.secret, slug, expiresAt), {
      httpOnly: true,
      secure: services.config.publicUrl.startsWith('https://'),
      sameSite: 'Lax',
      // Scoped to the share routes, so it is never sent with an ordinary API call.
      path: '/api/v1/share',
      expires: new Date(expiresAt),
    })
    return c.json({ unlocked: true })
  })

  app.get('/:slug', async (c) => {
    const share = await open(c.get('services'), c.req.param('slug'), c)
    if (share === 'locked') return c.json({ locked: true }, 401)
    return c.json({ locked: false, album: share.album, allowDownload: share.link.allowDownload })
  })

  app.get('/:slug/assets/:assetId/:variant{preview|thumbnail|original}', async (c) => {
    const services = c.get('services')
    const variant = c.req.param('variant') as 'preview' | 'thumbnail' | 'original'

    const share = await open(services, c.req.param('slug'), c)
    if (share === 'locked') throw unauthorized('This album is locked')

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
        // Private: a shared photo must not be cached by an intermediary proxy.
        'Cache-Control': 'private, max-age=3600',
      },
    })
  })

  return app
}

/** Resolves a share, requiring the unlock cookie when the album has a password. */
async function open(
  services: Services,
  slug: string,
  c: Parameters<typeof getCookie>[0],
): Promise<OpenedShare | 'locked'> {
  const share = await services.albums.openShare(slug)
  if (!share) throw notFound('This link is not valid, or it has expired')

  if (share.requiresPassword) {
    const token = getCookie(c, cookieName(slug))
    if (!verifyUnlock(services.config.secret, slug, token)) return 'locked'
  }

  return share
}
