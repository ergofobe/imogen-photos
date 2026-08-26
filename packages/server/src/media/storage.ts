import { createHash } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'

export type StoredFile = { path: string; sizeBytes: number }

/**
 * Everything the rest of the server needs from a filesystem. Keeping it this narrow is
 * what lets an S3 driver appear later without touching the media pipeline.
 */
export interface StorageDriver {
  write(relativePath: string, data: Blob | ArrayBufferView | string): Promise<StoredFile>
  moveInto(relativePath: string, sourceAbsolutePath: string): Promise<StoredFile>
  read(relativePath: string): Promise<Blob>
  exists(relativePath: string): Promise<boolean>
  remove(relativePath: string): Promise<void>
  absolutePath(relativePath: string): string
}

/**
 * Rejects any path that would escape the root once resolved. Asset paths are built from
 * database values, and a traversal there would let one user read another's originals.
 */
function safeJoin(root: string, relativePath: string): string {
  const target = resolve(root, normalize(relativePath))
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing to access "${relativePath}" outside the storage root`)
  }
  return target
}

export class LocalStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  absolutePath(relativePath: string): string {
    return safeJoin(this.root, relativePath)
  }

  async write(relativePath: string, data: Blob | ArrayBufferView | string): Promise<StoredFile> {
    const target = this.absolutePath(relativePath)
    await mkdir(dirname(target), { recursive: true })
    const sizeBytes = await Bun.write(target, data as Blob)
    return { path: relativePath, sizeBytes }
  }

  async moveInto(relativePath: string, sourceAbsolutePath: string): Promise<StoredFile> {
    const target = this.absolutePath(relativePath)
    await mkdir(dirname(target), { recursive: true })
    try {
      await rename(sourceAbsolutePath, target)
    } catch (error) {
      // rename fails across devices, which is normal when /tmp and /data differ.
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
      await Bun.write(target, Bun.file(sourceAbsolutePath))
      await rm(sourceAbsolutePath, { force: true })
    }
    const { size } = await stat(target)
    return { path: relativePath, sizeBytes: size }
  }

  async read(relativePath: string): Promise<Blob> {
    return Bun.file(this.absolutePath(relativePath))
  }

  async exists(relativePath: string): Promise<boolean> {
    return Bun.file(this.absolutePath(relativePath)).exists()
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.absolutePath(relativePath), { force: true })
  }
}

/**
 * Library paths are sharded by owner and capture month so that no directory grows
 * unbounded, and a human browsing the volume can still find things.
 */
export function libraryPath(input: {
  ownerId: string
  assetId: string
  capturedAt: Date
  filename: string
}): string {
  const year = input.capturedAt.getUTCFullYear()
  const month = String(input.capturedAt.getUTCMonth() + 1).padStart(2, '0')
  const ext = extname(input.filename).toLowerCase() || '.bin'
  return join(input.ownerId, String(year), month, `${input.assetId}${ext}`)
}

export function derivativePath(assetId: string, variant: 'thumbnail' | 'preview'): string {
  // Two levels of fan-out keeps directory listings small at a million assets.
  return join(assetId.slice(0, 2), assetId.slice(2, 4), `${assetId}-${variant}.webp`)
}

/** Streams a file through SHA-256 without holding it in memory. */
export async function hashFile(absolutePath: string): Promise<string> {
  const hash = createHash('sha256')
  const reader = Bun.file(absolutePath).stream().getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    hash.update(value)
  }
  return hash.digest('hex')
}
