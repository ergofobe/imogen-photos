import type {
  Album,
  AlbumAssetsResult,
  AlbumCreate,
  AlbumUpdate,
  ShareLink,
  ShareLinkCreate,
} from '@imogen/shared'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { type AlbumRow, albumAssets, albums, assets, shareLinks } from '../db/schema.ts'
import { forbidden, notFound } from '../lib/errors.ts'
import { generateToken } from '../lib/tokens.ts'
import { toAsset } from './serialize.ts'

function toAlbum(row: AlbumRow, assetCount: number, shareSlug: string | null): Album {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    coverAssetId: row.coverAssetId,
    assetCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    shareSlug,
  }
}

const SHARE_PASSWORD_HASH = { algorithm: 'argon2id', memoryCost: 19456, timeCost: 2 } as const

function hashSharePassword(password: string): Promise<string> {
  return Bun.password.hash(password, SHARE_PASSWORD_HASH)
}

export class AlbumService {
  constructor(private readonly db: Database) {}

  async list(ownerId: string): Promise<Album[]> {
    const rows = await this.db
      .select({
        album: albums,
        assetCount: sql<number>`count(${albumAssets.assetId})::int`,
        shareSlug: sql<string | null>`max(${shareLinks.slug})`,
      })
      .from(albums)
      .leftJoin(albumAssets, eq(albumAssets.albumId, albums.id))
      .leftJoin(shareLinks, and(eq(shareLinks.albumId, albums.id), isNull(shareLinks.revokedAt)))
      .where(eq(albums.ownerId, ownerId))
      .groupBy(albums.id)
      .orderBy(desc(albums.updatedAt))
    return rows.map((r) => toAlbum(r.album, Number(r.assetCount), r.shareSlug))
  }

  async get(ownerId: string, albumId: string): Promise<Album> {
    const [row] = await this.db.select().from(albums).where(eq(albums.id, albumId)).limit(1)
    if (!row) throw notFound('No such album')
    if (row.ownerId !== ownerId) throw forbidden('That album belongs to someone else')

    const [counted] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(albumAssets)
      .where(eq(albumAssets.albumId, albumId))
    const [share] = await this.db
      .select({ slug: shareLinks.slug })
      .from(shareLinks)
      .where(and(eq(shareLinks.albumId, albumId), isNull(shareLinks.revokedAt)))
      .limit(1)

    return toAlbum(row, Number(counted?.count ?? 0), share?.slug ?? null)
  }

  async getWithAssets(ownerId: string, albumId: string) {
    const album = await this.get(ownerId, albumId)
    const rows = await this.db
      .select({ asset: assets })
      .from(albumAssets)
      .innerJoin(assets, eq(assets.id, albumAssets.assetId))
      .where(and(eq(albumAssets.albumId, albumId), isNull(assets.deletedAt)))
      .orderBy(albumAssets.position, desc(assets.capturedAt))
    return { ...album, assets: rows.map((r) => toAsset(r.asset)) }
  }

  async create(ownerId: string, input: AlbumCreate): Promise<Album> {
    const [row] = await this.db
      .insert(albums)
      .values({ ownerId, name: input.name, description: input.description ?? null })
      .returning()
    const album = row!
    if (input.assetIds?.length) {
      await this.addAssets(ownerId, album.id, input.assetIds)
    }
    return this.get(ownerId, album.id)
  }

  async update(ownerId: string, albumId: string, patch: AlbumUpdate): Promise<Album> {
    await this.get(ownerId, albumId)
    await this.db
      .update(albums)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.coverAssetId !== undefined ? { coverAssetId: patch.coverAssetId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(albums.id, albumId))
    return this.get(ownerId, albumId)
  }

  async remove(ownerId: string, albumId: string): Promise<void> {
    await this.get(ownerId, albumId)
    // Deleting an album never deletes photos; they stay in the timeline.
    await this.db.delete(albums).where(eq(albums.id, albumId))
  }

  async addAssets(
    ownerId: string,
    albumId: string,
    assetIds: string[],
  ): Promise<AlbumAssetsResult> {
    await this.get(ownerId, albumId)

    // Only the caller's own assets, so an album cannot be used to reach someone else's.
    const owned = await this.db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.ownerId, ownerId), inArray(assets.id, assetIds)))
    const ownedIds = owned.map((a) => a.id)

    const [maxPosition] = await this.db
      .select({ max: sql<number>`coalesce(max(${albumAssets.position}), -1)::int` })
      .from(albumAssets)
      .where(eq(albumAssets.albumId, albumId))
    let position = Number(maxPosition?.max ?? -1)

    const inserted = ownedIds.length
      ? await this.db
          .insert(albumAssets)
          .values(ownedIds.map((assetId) => ({ albumId, assetId, position: ++position })))
          .onConflictDoNothing()
          .returning({ assetId: albumAssets.assetId })
      : []

    await this.db.update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, albumId))

    const [counted] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(albumAssets)
      .where(eq(albumAssets.albumId, albumId))

    return {
      added: inserted.length,
      skipped: assetIds.length - inserted.length,
      assetCount: Number(counted?.count ?? 0),
    }
  }

  async removeAssets(ownerId: string, albumId: string, assetIds: string[]): Promise<number> {
    await this.get(ownerId, albumId)
    const removed = await this.db
      .delete(albumAssets)
      .where(and(eq(albumAssets.albumId, albumId), inArray(albumAssets.assetId, assetIds)))
      .returning({ assetId: albumAssets.assetId })
    await this.db.update(albums).set({ updatedAt: new Date() }).where(eq(albums.id, albumId))
    return removed.length
  }

  // --- Sharing ---

  async createShareLink(
    ownerId: string,
    albumId: string,
    input: ShareLinkCreate,
    publicUrl: string,
  ): Promise<ShareLink> {
    await this.get(ownerId, albumId)
    // Revoke any previous link so one album has at most one live URL.
    await this.db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.albumId, albumId), isNull(shareLinks.revokedAt)))

    const slug = generateToken('s', 12).replace('s_', '')
    const [row] = await this.db
      .insert(shareLinks)
      .values({
        slug,
        albumId,
        createdBy: ownerId,
        // A share password is chosen by a human, so it needs a salted, slow KDF —
        // unlike the high-entropy random tokens elsewhere, which SHA-256 handles fine.
        passwordHash: input.password ? await hashSharePassword(input.password) : null,
        allowDownload: input.allowDownload,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning()

    return {
      slug: row!.slug,
      url: `${publicUrl}/share/${row!.slug}`,
      albumId,
      expiresAt: row!.expiresAt?.toISOString() ?? null,
      allowDownload: row!.allowDownload,
      createdAt: row!.createdAt.toISOString(),
    }
  }

  async revokeShareLink(ownerId: string, albumId: string): Promise<void> {
    await this.get(ownerId, albumId)
    await this.db
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLinks.albumId, albumId), isNull(shareLinks.revokedAt)))
  }

  /** Resolves a public share slug. Returns null for unknown, revoked, or expired links. */
  async resolveShare(slug: string, password?: string) {
    const [link] = await this.db
      .select()
      .from(shareLinks)
      .where(and(eq(shareLinks.slug, slug), isNull(shareLinks.revokedAt)))
      .limit(1)
    if (!link) return null
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null
    if (link.passwordHash) {
      // Bun.password.verify is constant-time, so a wrong guess leaks nothing by timing.
      const matches = password ? await Bun.password.verify(password, link.passwordHash) : false
      if (!matches) return { link, locked: true as const, album: null }
    }

    const [album] = await this.db.select().from(albums).where(eq(albums.id, link.albumId)).limit(1)
    if (!album) return null

    const rows = await this.db
      .select({ asset: assets })
      .from(albumAssets)
      .innerJoin(assets, eq(assets.id, albumAssets.assetId))
      .where(and(eq(albumAssets.albumId, link.albumId), isNull(assets.deletedAt)))
      .orderBy(albumAssets.position)

    return {
      link,
      locked: false as const,
      album: {
        ...toAlbum(album, rows.length, link.slug),
        assets: rows.map((r) => toAsset(r.asset)),
      },
    }
  }
}
