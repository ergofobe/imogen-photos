import type { Asset, AssetQuery, AssetUpdate, LibraryStats, TimelineBucket } from '@imogen/shared'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { Database } from '../db/index.ts'
import { albumAssets, assets } from '../db/schema.ts'
import { forbidden, notFound } from '../lib/errors.ts'
import { toAsset } from './serialize.ts'

/** Kept identical to the translate() in the generated search vector. */
const SEARCH_PUNCTUATION = '._-/\\'

export type AssetPage = {
  items: Asset[]
  nextCursor: string | null
  total: number | null
}

/**
 * A cursor is the sort key of the last row returned. Offsets would be wrong here: an
 * upload while the user is scrolling shifts every later page by one, so they would see
 * a photo twice and miss another.
 */
type Cursor = { value: string; id: string }

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Cursor
    return typeof parsed?.value === 'string' && typeof parsed?.id === 'string' ? parsed : null
  } catch {
    return null
  }
}

export class AssetService {
  constructor(private readonly db: Database) {}

  async list(ownerId: string, query: AssetQuery): Promise<AssetPage> {
    const conditions = this.buildFilters(ownerId, query)
    const sortColumn =
      query.sort === 'createdAt'
        ? assets.createdAt
        : query.sort === 'filename'
          ? assets.originalFilename
          : assets.capturedAt
    const descending = query.order !== 'asc'

    const cursor = query.cursor ? decodeCursor(query.cursor) : null
    if (cursor) {
      // Tie-break on id so assets sharing a timestamp are neither skipped nor repeated.
      const boundary = descending
        ? or(
            sql`${sortColumn} < ${cursor.value}`,
            and(sql`${sortColumn} = ${cursor.value}`, sql`${assets.id} < ${cursor.id}`),
          )
        : or(
            sql`${sortColumn} > ${cursor.value}`,
            and(sql`${sortColumn} = ${cursor.value}`, sql`${assets.id} > ${cursor.id}`),
          )
      conditions.push(boundary!)
    }

    const order = descending
      ? [desc(sortColumn), desc(assets.id)]
      : [asc(sortColumn), asc(assets.id)]

    // Fetch one extra row to learn whether another page exists, without a second query.
    const rows = await this.db
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(...order)
      .limit(query.limit + 1)

    const hasMore = rows.length > query.limit
    const page = hasMore ? rows.slice(0, query.limit) : rows
    const last = page.at(-1)

    return {
      items: page.map(toAsset),
      nextCursor:
        hasMore && last
          ? encodeCursor({ value: this.cursorValue(last, query.sort), id: last.id })
          : null,
      total: null,
    }
  }

  private cursorValue(row: typeof assets.$inferSelect, sort: AssetQuery['sort']): string {
    if (sort === 'filename') return row.originalFilename
    const date = sort === 'createdAt' ? row.createdAt : row.capturedAt
    return date.toISOString()
  }

  private buildFilters(ownerId: string, query: AssetQuery): SQL[] {
    // The vault is not a filter anyone can turn off. Assets inside it are excluded from
    // every ordinary listing, search, and count; the only way to see them is through
    // VaultService, which requires a freshly unlocked session.
    const conditions: SQL[] = [eq(assets.ownerId, ownerId), isNull(assets.vaultedAt)]

    conditions.push(query.trashed ? isNotNull(assets.deletedAt) : isNull(assets.deletedAt))

    // Archived photos stay out of the timeline unless explicitly requested.
    if (query.archived !== undefined) {
      conditions.push(eq(assets.archived, query.archived))
    } else if (!query.trashed) {
      conditions.push(eq(assets.archived, false))
    }

    if (query.type) conditions.push(eq(assets.type, query.type))
    if (query.favorite !== undefined) conditions.push(eq(assets.favorite, query.favorite))
    if (query.takenAfter) conditions.push(gte(assets.capturedAt, new Date(query.takenAfter)))
    if (query.takenBefore) conditions.push(lte(assets.capturedAt, new Date(query.takenBefore)))

    if (query.albumId) {
      conditions.push(
        sql`exists (select 1 from ${albumAssets} where ${albumAssets.assetId} = ${assets.id} and ${albumAssets.albumId} = ${query.albumId})`,
      )
    }

    if (query.bbox) {
      const [minLat, minLon, maxLat, maxLon] = query.bbox.split(',').map(Number)
      conditions.push(
        sql`${assets.latitude} between ${minLat} and ${maxLat} and ${assets.longitude} between ${minLon} and ${maxLon}`,
      )
    }

    if (query.q?.trim()) {
      // websearch_to_tsquery takes arbitrary user text: no escaping, no syntax errors.
      // The query must be punctuation-normalised exactly as the index is, or searching
      // "shot-3" compiles to 'shot' <-> '-3' and misses the indexed 'shot','3'.
      conditions.push(
        sql`${assets.searchVector} @@ websearch_to_tsquery('simple', translate(${query.q.trim()}, ${SEARCH_PUNCTUATION}, '     '))`,
      )
    }

    return conditions
  }

  /**
   * Fetching a single asset by id. Vaulted assets stay hidden unless the caller has
   * already proved the vault is unlocked — otherwise knowing an id would be enough to
   * read a photo somebody deliberately put away.
   */
  async get(ownerId: string, assetId: string, options: { includeVaulted?: boolean } = {}) {
    const [row] = await this.db.select().from(assets).where(eq(assets.id, assetId)).limit(1)
    if (!row) throw notFound('No such photo')
    if (row.ownerId !== ownerId) throw forbidden('That photo belongs to someone else')
    if (row.vaultedAt && !options.includeVaulted) {
      throw forbidden('That photo is in the vault')
    }
    return toAsset(row)
  }

  async update(ownerId: string, assetId: string, patch: AssetUpdate): Promise<Asset> {
    await this.get(ownerId, assetId, { includeVaulted: true })

    const [row] = await this.db
      .update(assets)
      .set({
        ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
        ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.capturedAt
          ? { capturedAt: new Date(patch.capturedAt), capturedAtIsExact: true }
          : {}),
        ...(patch.location !== undefined
          ? {
              latitude: patch.location?.latitude ?? null,
              longitude: patch.location?.longitude ?? null,
              altitude: patch.location?.altitude ?? null,
              place: patch.location?.place ?? null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId))
      .returning()
    return toAsset(row!)
  }

  /** Soft delete. Nothing is destroyed until the retention sweep runs. */
  async trash(ownerId: string, assetIds: string[]): Promise<number> {
    if (assetIds.length === 0) return 0
    const rows = await this.db
      .update(assets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(assets.ownerId, ownerId), inArray(assets.id, assetIds), isNull(assets.deletedAt)),
      )
      .returning({ id: assets.id })
    return rows.length
  }

  async restore(ownerId: string, assetIds: string[]): Promise<number> {
    if (assetIds.length === 0) return 0
    const rows = await this.db
      .update(assets)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(assets.ownerId, ownerId), inArray(assets.id, assetIds)))
      .returning({ id: assets.id })
    return rows.length
  }

  async timeline(ownerId: string): Promise<TimelineBucket[]> {
    const rows = await this.db
      .select({
        date: sql<string>`to_char(${assets.capturedAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(assets)
      .where(
        and(
          eq(assets.ownerId, ownerId),
          isNull(assets.deletedAt),
          isNull(assets.vaultedAt),
          eq(assets.archived, false),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1 desc`)
    return rows.map((r) => ({ date: r.date, count: Number(r.count) }))
  }

  async stats(ownerId: string): Promise<LibraryStats> {
    const live = and(eq(assets.ownerId, ownerId), isNull(assets.deletedAt))
    const [row] = await this.db
      .select({
        assetCount: sql<number>`count(*) filter (where ${assets.deletedAt} is null)::int`,
        imageCount: sql<number>`count(*) filter (where ${assets.deletedAt} is null and ${assets.type} = 'image')::int`,
        videoCount: sql<number>`count(*) filter (where ${assets.deletedAt} is null and ${assets.type} = 'video')::int`,
        favoriteCount: sql<number>`count(*) filter (where ${assets.deletedAt} is null and ${assets.favorite})::int`,
        trashedCount: sql<number>`count(*) filter (where ${assets.deletedAt} is not null)::int`,
        storageBytes: sql<number>`coalesce(sum(${assets.sizeBytes}) filter (where ${assets.deletedAt} is null), 0)::bigint`,
        earliest: sql<Date | null>`min(${assets.capturedAt}) filter (where ${assets.deletedAt} is null)`,
        latest: sql<Date | null>`max(${assets.capturedAt}) filter (where ${assets.deletedAt} is null)`,
      })
      .from(assets)
      .where(and(eq(assets.ownerId, ownerId), isNull(assets.vaultedAt)))

    const [albumRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sql`albums`)
      .where(sql`albums.owner_id = ${ownerId}`)

    void live
    return {
      assetCount: Number(row?.assetCount ?? 0),
      imageCount: Number(row?.imageCount ?? 0),
      videoCount: Number(row?.videoCount ?? 0),
      albumCount: Number(albumRow?.count ?? 0),
      favoriteCount: Number(row?.favoriteCount ?? 0),
      trashedCount: Number(row?.trashedCount ?? 0),
      storageBytes: Number(row?.storageBytes ?? 0),
      earliestCapturedAt: row?.earliest ? new Date(row.earliest).toISOString() : null,
      latestCapturedAt: row?.latest ? new Date(row.latest).toISOString() : null,
    }
  }
}
