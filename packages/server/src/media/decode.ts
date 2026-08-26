import type { Sharp } from 'sharp'
import sharp from 'sharp'

export type Decoded = {
  source: Sharp
  width: number
  height: number
  /** True when ffmpeg had to decode the pixels because sharp could not. */
  viaFfmpeg: boolean
}

/**
 * sharp's prebuilt binary parses HEIF containers but cannot decode HEVC-coded pixels,
 * which is what every iPhone produces. It reports metadata happily and then fails on
 * `toBuffer()` with "bad seek". RAW files fail earlier, at `metadata()`.
 *
 * So neither a successful `metadata()` call nor a clean open proves the pixels are
 * readable. The only reliable test is to decode a pixel, which is what this does before
 * committing to a source.
 */
export async function decodeImage(path: string, ffmpegPath: string): Promise<Decoded | null> {
  const native = await tryNative(path)
  if (native) return native

  const png = await decodeWithFfmpeg(path, ffmpegPath)
  if (!png) return null

  const source = sharp(png)
  const meta = await source.metadata().catch(() => null)
  if (!meta?.width || !meta.height) return null
  return { source, width: meta.width, height: meta.height, viaFfmpeg: true }
}

async function tryNative(path: string): Promise<Decoded | null> {
  try {
    const source = sharp(path, { failOn: 'error' })
    const meta = await source.metadata()
    if (!meta.width || !meta.height) return null
    // Decode one pixel. Cheap, and it proves the codec is actually available.
    await source.clone().resize(1, 1, { fit: 'fill' }).raw().toBuffer()
    return { source, width: meta.width, height: meta.height, viaFfmpeg: false }
  } catch {
    return null
  }
}

/** Decodes anything ffmpeg understands into a PNG buffer sharp can then work with. */
export async function decodeWithFfmpeg(
  path: string,
  ffmpegPath: string,
  seekSeconds = 0,
): Promise<Buffer | null> {
  const args = [ffmpegPath, '-loglevel', 'error']
  if (seekSeconds > 0) args.push('-ss', seekSeconds.toFixed(2))
  args.push('-i', path, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1')

  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'ignore' })
  const buffer = Buffer.from(await new Response(proc.stdout).arrayBuffer())
  const code = await proc.exited
  if (code === 0 && buffer.length > 0) return buffer
  // Seeking past the end of a short clip yields nothing; retry from the start.
  return seekSeconds > 0 ? decodeWithFfmpeg(path, ffmpegPath, 0) : null
}
