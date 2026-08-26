import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

/** Postgres full-text search vector. Drizzle has no native tsvector column type. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
})

/**
 * Bun's SQL driver already serializes objects bound to a json/jsonb parameter. Drizzle's
 * built-in `jsonb` stringifies first, so the value lands as a JSON *string* containing
 * JSON: `jsonb_typeof` reports "string" and `->>` returns null. It round-trips through
 * Drizzle because the decode is symmetric, which hides the damage from tests that only
 * read back through the ORM — but the generated search vector and every external reader
 * see the wrong thing. Passing the value through untouched is the fix.
 */
const json = <T>(name: string) =>
  customType<{ data: T; driverData: T }>({
    dataType: () => 'jsonb',
    toDriver: (value: T) => value,
  })(name)

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ['admin', 'user'] })
      .notNull()
      .default('user'),
    /** Null for accounts that authenticate only through OIDC. */
    passwordHash: text('password_hash'),
    oidcSubject: text('oidc_subject'),
    avatarUrl: text('avatar_url'),
    /**
     * The vault's own passphrase, separate from the account password on purpose: SSO
     * users have no local password, and a borrowed unlocked session should not open it.
     */
    vaultPassphraseHash: text('vault_passphrase_hash'),
    /** Throttles guessing. Cleared on a successful unlock. */
    vaultFailedAttempts: integer('vault_failed_attempts').notNull().default(0),
    vaultLockedUntil: timestamp('vault_locked_until', { withTimezone: true }),
    quotaBytes: bigint('quota_bytes', { mode: 'number' }),
    usedBytes: bigint('used_bytes', { mode: 'number' }).notNull().default(0),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
    uniqueIndex('users_oidc_subject_key')
      .on(t.oidcSubject)
      .where(sql`${t.oidcSubject} is not null`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt,
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
  ],
)

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['image', 'video'] }).notNull(),
    status: text('status', { enum: ['pending', 'processing', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    checksum: text('checksum').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Path relative to the library root, so the data directory can move. */
    originalPath: text('original_path').notNull(),
    width: integer('width'),
    height: integer('height'),
    duration: real('duration'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
    capturedAtIsExact: boolean('captured_at_is_exact').notNull().default(false),
    favorite: boolean('favorite').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    description: text('description'),
    exif: json<Record<string, unknown>>('exif'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    altitude: doublePrecision('altitude'),
    place: text('place'),
    placeholderColor: text('placeholder_color'),
    livePhotoVideoId: uuid('live_photo_video_id'),
    deviceAssetId: text('device_asset_id'),
    /** Reserved for CLIP embeddings; stays null until the optional ML sidecar exists. */
    embedding: vector('embedding', { dimensions: 512 }),
    /**
     * Maintained by Postgres, so a description edit cannot forget to reindex.
     * Weights put the filename and description above camera and place.
     */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      // Postgres indexes "harbour-sunset.jpg" as a single `file` token, so searching for
      // "harbour" would miss it. Replacing punctuation with spaces first makes every part
      // of a filename findable, which is how people actually search for their photos.
      sql`setweight(to_tsvector('simple', translate(coalesce(original_filename, ''), '._-/\\', '     ')), 'A') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'A') ||
          setweight(to_tsvector('simple', coalesce(place, '')), 'B') ||
          setweight(to_tsvector('simple', coalesce(exif->>'make', '') || ' ' || coalesce(exif->>'model', '')), 'C')`,
    ),
    /** Non-null means the asset lives in the vault and is hidden from everything else. */
    vaultedAt: timestamp('vaulted_at', { withTimezone: true }),
    processingError: text('processing_error'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Re-uploading a file you already have is a no-op, not a duplicate row.
    uniqueIndex('assets_owner_checksum_key').on(t.ownerId, t.checksum),
    uniqueIndex('assets_owner_device_asset_key')
      .on(t.ownerId, t.deviceAssetId)
      .where(sql`${t.deviceAssetId} is not null`),
    // The timeline's only hot query: owner's live assets, newest first, tie-broken by id.
    index('assets_timeline_idx')
      .on(t.ownerId, t.capturedAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null and ${t.vaultedAt} is null`),
    index('assets_vault_idx')
      .on(t.ownerId, t.capturedAt.desc(), t.id.desc())
      .where(sql`${t.vaultedAt} is not null`),
    index('assets_owner_status_idx').on(t.ownerId, t.status),
    index('assets_deleted_at_idx').on(t.deletedAt).where(sql`${t.deletedAt} is not null`),
    index('assets_search_idx').using('gin', t.searchVector),
    index('assets_location_idx')
      .on(t.ownerId, t.latitude, t.longitude)
      .where(sql`${t.latitude} is not null`),
  ],
)

export const assetFiles = pgTable(
  'asset_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    variant: text('variant', { enum: ['original', 'preview', 'thumbnail'] }).notNull(),
    path: text('path').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt,
  },
  (t) => [uniqueIndex('asset_files_asset_variant_key').on(t.assetId, t.variant)],
)

export const albums = pgTable(
  'albums',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    coverAssetId: uuid('cover_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    createdAt,
    updatedAt,
  },
  (t) => [index('albums_owner_idx').on(t.ownerId, t.updatedAt.desc())],
)

export const albumAssets = pgTable(
  'album_assets',
  {
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.assetId] }),
    index('album_assets_asset_idx').on(t.assetId),
    index('album_assets_order_idx').on(t.albumId, t.position),
  ],
)

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    passwordHash: text('password_hash'),
    allowDownload: boolean('allow_download').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex('share_links_slug_key').on(t.slug),
    index('share_links_album_idx').on(t.albumId),
  ],
)

// --- OAuth 2.1 authorization server ---

export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey(),
    /** Null for public clients (PKCE only), which is what native apps and MCP use. */
    secretHash: text('secret_hash'),
    name: text('name').notNull(),
    redirectUris: json<string[]>('redirect_uris').notNull(),
    grantTypes: json<string[]>('grant_types').notNull(),
    scopes: json<string[]>('scopes').notNull(),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method').notNull().default('none'),
    clientUri: text('client_uri'),
    logoUri: text('logo_uri'),
    /** True when created through RFC 7591 rather than by an administrator. */
    dynamicallyRegistered: boolean('dynamically_registered').notNull().default(false),
    createdAt,
  },
  (t) => [index('oauth_clients_created_idx').on(t.createdAt)],
)

export const oauthAuthCodes = pgTable(
  'oauth_auth_codes',
  {
    /** SHA-256 of the code. Codes are single-use and short-lived. */
    codeHash: text('code_hash').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    scopes: json<string[]>('scopes').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull(),
    /** Ties this code to the token family it mints, so a replay can revoke exactly those. */
    familyId: uuid('family_id').notNull(),
    /** Set when redeemed, so a replayed code is detectable rather than merely expired. */
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [index('oauth_auth_codes_expires_idx').on(t.expiresAt)],
)

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    kind: text('kind', { enum: ['access', 'refresh'] }).notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopes: json<string[]>('scopes').notNull(),
    /**
     * Rotation lineage. Presenting an already-rotated refresh token revokes the whole
     * family, which is how a stolen token stops being useful.
     */
    familyId: uuid('family_id').notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [
    uniqueIndex('oauth_tokens_hash_key').on(t.tokenHash),
    index('oauth_tokens_family_idx').on(t.familyId),
    index('oauth_tokens_user_client_idx').on(t.userId, t.clientId),
    index('oauth_tokens_expires_idx').on(t.expiresAt),
  ],
)

// --- Uploads and jobs ---

export const uploadSessions = pgTable(
  'upload_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    receivedBytes: bigint('received_bytes', { mode: 'number' }).notNull().default(0),
    tempPath: text('temp_path').notNull(),
    metadata: json<Record<string, unknown>>('metadata'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index('upload_sessions_user_idx').on(t.userId),
    index('upload_sessions_expires_idx').on(t.expiresAt),
  ],
)

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    payload: json<Record<string, unknown>>('payload').notNull(),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lastError: text('last_error'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt,
  },
  // The claim query: queued work whose time has come, oldest first.
  (t) => [index('jobs_claim_idx').on(t.status, t.runAt).where(sql`${t.status} = 'queued'`)],
)

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: json<unknown>('value').notNull(),
  updatedAt,
})

export type UserRow = typeof users.$inferSelect
export type AssetRow = typeof assets.$inferSelect
export type AssetFileRow = typeof assetFiles.$inferSelect
export type AlbumRow = typeof albums.$inferSelect
export type OAuthClientRow = typeof oauthClients.$inferSelect
export type OAuthTokenRow = typeof oauthTokens.$inferSelect
export type JobRow = typeof jobs.$inferSelect
export type UploadSessionRow = typeof uploadSessions.$inferSelect
