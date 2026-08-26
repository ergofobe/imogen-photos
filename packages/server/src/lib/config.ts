import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'

const bool = z
  .string()
  .transform((v) => v.toLowerCase())
  .pipe(z.enum(['true', 'false', '1', '0', 'yes', 'no']))
  .transform((v) => v === 'true' || v === '1' || v === 'yes')

const EnvSchema = z.object({
  IMOGEN_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  IMOGEN_PUBLIC_URL: z.url().default('http://localhost:3000'),
  IMOGEN_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  IMOGEN_DATA_DIR: z.string().default('./data'),
  IMOGEN_ALLOW_SIGNUP: bool.default(true),

  IMOGEN_OIDC_ISSUER: z
    .url()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  IMOGEN_OIDC_CLIENT_ID: z.string().optional(),
  IMOGEN_OIDC_CLIENT_SECRET: z.string().optional(),
  IMOGEN_OIDC_SCOPES: z.string().default('openid profile email'),
  IMOGEN_OIDC_ADMIN_CLAIM: z.string().default('groups'),
  IMOGEN_OIDC_ADMIN_VALUE: z.string().optional(),
  IMOGEN_OIDC_LABEL: z.string().default('Single sign-on'),

  IMOGEN_FFMPEG_PATH: z.string().default('ffmpeg'),
  IMOGEN_FFPROBE_PATH: z.string().default('ffprobe'),
  IMOGEN_HEIF_DEC_PATH: z.string().default('heif-dec'),
  IMOGEN_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  IMOGEN_TRASH_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
})

export type OidcConfig = {
  issuer: string
  clientId: string
  clientSecret: string
  scopes: string
  adminClaim: string
  adminValue: string | undefined
  label: string
}

export type Config = {
  port: number
  publicUrl: string
  secret: string
  databaseUrl: string
  dataDir: string
  libraryDir: string
  thumbsDir: string
  uploadsDir: string
  allowSignup: boolean
  oidc: OidcConfig | null
  ffmpegPath: string
  ffprobePath: string
  heifDecPath: string
  jobConcurrency: number
  trashRetentionDays: number
}

/**
 * A deployment that starts with a default secret is a deployment whose sessions can be
 * forged by anyone who has read the README. So: generate one on first run, persist it
 * with owner-only permissions, and fail loudly if that is impossible.
 */
function resolveSecret(explicit: string | undefined, dataDir: string): string {
  if (explicit) return explicit
  const secretPath = join(dataDir, '.secret')
  if (existsSync(secretPath)) {
    const stored = readFileSync(secretPath, 'utf8').trim()
    if (stored.length >= 32) return stored
  }
  const generated = randomBytes(48).toString('base64url')
  try {
    writeFileSync(secretPath, generated, { mode: 0o600 })
    chmodSync(secretPath, 0o600)
  } catch (cause) {
    throw new Error(
      `IMOGEN_SECRET is unset and ${secretPath} could not be written. ` +
        'Set IMOGEN_SECRET explicitly or make the data directory writable.',
      { cause },
    )
  }
  return generated
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`)
  }
  const e = parsed.data

  const dataDir = resolve(e.IMOGEN_DATA_DIR)
  const libraryDir = join(dataDir, 'library')
  const thumbsDir = join(dataDir, 'thumbs')
  const uploadsDir = join(dataDir, 'uploads')
  for (const dir of [dataDir, libraryDir, thumbsDir, uploadsDir])
    mkdirSync(dir, { recursive: true })

  const oidcFieldsPresent =
    e.IMOGEN_OIDC_ISSUER || e.IMOGEN_OIDC_CLIENT_ID || e.IMOGEN_OIDC_CLIENT_SECRET
  if (
    oidcFieldsPresent &&
    !(e.IMOGEN_OIDC_ISSUER && e.IMOGEN_OIDC_CLIENT_ID && e.IMOGEN_OIDC_CLIENT_SECRET)
  ) {
    throw new Error(
      'Partial OIDC configuration: set IMOGEN_OIDC_ISSUER, IMOGEN_OIDC_CLIENT_ID, and ' +
        'IMOGEN_OIDC_CLIENT_SECRET together, or none of them.',
    )
  }

  return {
    port: e.IMOGEN_PORT,
    publicUrl: e.IMOGEN_PUBLIC_URL.replace(/\/+$/, ''),
    secret: resolveSecret(e.IMOGEN_SECRET, dataDir),
    databaseUrl: e.DATABASE_URL,
    dataDir,
    libraryDir,
    thumbsDir,
    uploadsDir,
    allowSignup: e.IMOGEN_ALLOW_SIGNUP,
    oidc: oidcFieldsPresent
      ? {
          issuer: e.IMOGEN_OIDC_ISSUER!,
          clientId: e.IMOGEN_OIDC_CLIENT_ID!,
          clientSecret: e.IMOGEN_OIDC_CLIENT_SECRET!,
          scopes: e.IMOGEN_OIDC_SCOPES,
          adminClaim: e.IMOGEN_OIDC_ADMIN_CLAIM,
          adminValue: e.IMOGEN_OIDC_ADMIN_VALUE,
          label: e.IMOGEN_OIDC_LABEL,
        }
      : null,
    ffmpegPath: e.IMOGEN_FFMPEG_PATH,
    ffprobePath: e.IMOGEN_FFPROBE_PATH,
    heifDecPath: e.IMOGEN_HEIF_DEC_PATH,
    jobConcurrency: e.IMOGEN_JOB_CONCURRENCY,
    trashRetentionDays: e.IMOGEN_TRASH_RETENTION_DAYS,
  }
}
