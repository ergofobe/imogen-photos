import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  Asset,
  AssetQuery,
  AssetUpdate,
  AssetUploadMetadata,
  AssetUploadResult,
  AssetVariant,
  LibraryStats,
  pageOf,
  TimelineBucket,
} from '@imogen/shared'
import { eq } from 'drizzle-orm'
import { type AppEnv, requireAuth, requireScope } from '../auth/middleware.ts'
import { assetFiles, assets } from '../db/schema.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { ERROR_RESPONSES, ok, security } from './openapi.ts'

const IdParam = z.object({ id: z.uuid() })
const IdsBody = z.object({ assetIds: z.array(z.uuid()).min(1).max(1000) })
const CountResult = z.object({ count: z.number().int().nonnegative() })

export function createAssetRoutes() {
  const app = new OpenAPIHono<AppEnv>()
  app.use('*', requireAuth())

  app.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags: ['Assets'],
      summary: 'List and search photos and videos',
      security: security(),
      middleware: [requireScope('library:read')] as const,
      request: { query: AssetQuery },
      responses: { ...ok(pageOf(Asset), 'A page of assets'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const page = await services.assets.list(c.get('principal').user.id, c.req.valid('query'))
      return c.json(page, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/timeline',
      tags: ['Assets'],
      summary: 'Per-day counts, so a client can size its scrollbar before loading anything',
      security: security(),
      middleware: [requireScope('library:read')] as const,
      responses: {
        ...ok(z.object({ buckets: z.array(TimelineBucket) }), 'Day buckets, newest first'),
        ...ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const services = c.get('services')
      const buckets = await services.assets.timeline(c.get('principal').user.id)
      return c.json({ buckets }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/stats',
      tags: ['Assets'],
      summary: 'Library totals',
      security: security(),
      middleware: [requireScope('library:read')] as const,
      responses: { ...ok(LibraryStats, 'Library statistics'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      return c.json(await services.assets.stats(c.get('principal').user.id), 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags: ['Assets'],
      summary: 'Upload one photo or video',
      description:
        'Multipart upload. Re-uploading bytes that already exist returns the existing ' +
        'asset with `duplicate: true` rather than storing a second copy.',
      security: security(),
      middleware: [requireScope('library:write')] as const,
      request: {
        body: {
          content: {
            'multipart/form-data': {
              schema: z.object({
                file: z.any().openapi({ type: 'string', format: 'binary' }),
                deviceAssetId: z.string().optional(),
                capturedAt: z.string().optional(),
                favorite: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        ...ok(AssetUploadResult, 'The asset already existed'),
        201: {
          description: 'The asset was created',
          content: { 'application/json': { schema: AssetUploadResult } },
        },
        ...ERROR_RESPONSES,
      },
    }),
    async (c) => {
      const services = c.get('services')
      const form = await c.req.parseBody()
      const file = form.file
      if (!(file instanceof File)) throw badRequest('Attach the photo as a "file" field')

      const metadata = AssetUploadMetadata.safeParse({
        deviceAssetId: str(form.deviceAssetId),
        capturedAt: str(form.capturedAt),
        favorite: str(form.favorite),
        filename: str(form.filename),
      })
      if (!metadata.success) {
        throw badRequest('Invalid upload metadata', fieldErrors(metadata.error))
      }

      const tempPath = await spool(services.config.uploadsDir, file)
      const result = await services.ingest.ingest({
        ownerId: c.get('principal').user.id,
        tempPath,
        filename: file.name || 'upload',
        mimeType: file.type || 'application/octet-stream',
        metadata: metadata.data,
      })
      return c.json(result, result.duplicate ? 200 : 201)
    },
  )

  app.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags: ['Assets'],
      summary: 'One asset',
      security: security(),
      middleware: [requireScope('library:read')] as const,
      request: { params: IdParam },
      responses: { ...ok(Asset, 'The asset'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const asset = await services.assets.get(c.get('principal').user.id, c.req.valid('param').id)
      return c.json(asset, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags: ['Assets'],
      summary: 'Edit an asset',
      security: security(),
      middleware: [requireScope('library:write')] as const,
      request: {
        params: IdParam,
        body: { content: { 'application/json': { schema: AssetUpdate } } },
      },
      responses: { ...ok(Asset, 'The updated asset'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const asset = await services.assets.update(
        c.get('principal').user.id,
        c.req.valid('param').id,
        c.req.valid('json'),
      )
      return c.json(asset, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/trash',
      tags: ['Assets'],
      summary: 'Move assets to the trash',
      description: 'Reversible. Assets are destroyed only after the retention window.',
      security: security(),
      middleware: [requireScope('library:write')] as const,
      request: { body: { content: { 'application/json': { schema: IdsBody } } } },
      responses: { ...ok(CountResult, 'How many moved'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const count = await services.assets.trash(
        c.get('principal').user.id,
        c.req.valid('json').assetIds,
      )
      return c.json({ count }, 200)
    },
  )

  app.openapi(
    createRoute({
      method: 'post',
      path: '/restore',
      tags: ['Assets'],
      summary: 'Restore assets from the trash',
      security: security(),
      middleware: [requireScope('library:write')] as const,
      request: { body: { content: { 'application/json': { schema: IdsBody } } } },
      responses: { ...ok(CountResult, 'How many restored'), ...ERROR_RESPONSES },
    }),
    async (c) => {
      const services = c.get('services')
      const count = await services.assets.restore(
        c.get('principal').user.id,
        c.req.valid('json').assetIds,
      )
      return c.json({ count }, 200)
    },
  )

  // Binary endpoints stay out of the OpenAPI document: an SDK wants a URL here,
  // not a generated method that buffers a 4K video into memory.
  app.get('/:id/:variant{original|preview|thumbnail}', requireScope('library:read'), async (c) => {
    const services = c.get('services')
    const assetId = c.req.param('id')
    const variant = AssetVariant.parse(c.req.param('variant'))

    const asset = await services.assets.get(c.get('principal').user.id, assetId)

    const [file] = await services.db
      .select()
      .from(assetFiles)
      .where(eq(assetFiles.assetId, assetId))
      .then((rows) => rows.filter((r) => r.variant === variant))
    if (!file) throw notFound(`This asset has no ${variant} yet`)

    const store = variant === 'original' ? services.library : services.thumbnails
    const blob = await store.read(file.path)
    if (!(await Bun.file(store.absolutePath(file.path)).exists())) {
      throw notFound('The stored file is missing')
    }

    // Derivatives are immutable — their path contains the asset id and variant — so they
    // can be cached hard. Originals are private, so they are cached per-browser only.
    const cacheControl =
      variant === 'original' ? 'private, max-age=3600' : 'private, max-age=31536000, immutable'

    return new Response(blob, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.sizeBytes),
        // Bun serves a Range request from a file-backed Response on its own; advertising
        // it is what tells a video player that scrubbing is available at all.
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
        ETag: `"${asset.checksum.slice(0, 32)}-${variant}"`,
        'Content-Disposition':
          variant === 'original'
            ? `inline; filename="${encodeURIComponent(asset.originalFilename)}"`
            : 'inline',
      },
    })
  })

  app.get('/:id/download', requireScope('library:read'), async (c) => {
    const services = c.get('services')
    const asset = await services.assets.get(c.get('principal').user.id, c.req.param('id'))
    const [row] = await services.db.select().from(assets).where(eq(assets.id, asset.id)).limit(1)
    if (!row) throw notFound('No such photo')

    return new Response(await services.library.read(row.originalPath), {
      headers: {
        'Content-Type': row.mimeType,
        'Content-Length': String(row.sizeBytes),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(row.originalFilename)}"`,
      },
    })
  })

  return app
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    const messages = details[key] ?? []
    messages.push(issue.message)
    details[key] = messages
  }
  return details
}

/** Writes the upload to disk before hashing, so a large video never sits in memory. */
async function spool(uploadsDir: string, file: File): Promise<string> {
  await mkdir(uploadsDir, { recursive: true })
  const tempPath = join(uploadsDir, `${crypto.randomUUID()}.part`)
  await Bun.write(tempPath, file)
  return tempPath
}
