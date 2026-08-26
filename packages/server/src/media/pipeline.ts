import { extname } from 'node:path'
import type { AssetType, ExifData, GeoPoint } from '@imogen/shared'
import exifr from 'exifr'
import type { Sharp } from 'sharp'
import sharp from 'sharp'
import { decodeImage, decodeWithFfmpeg } from './decode.ts'

const THUMBNAIL_EDGE = 320
const PREVIEW_EDGE = 1440

/** Formats sharp cannot open, which ffmpeg decodes for us instead. */
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.tif',
  '.tiff',
  '.bmp',
  '.heic',
  '.heif',
  '.jxl',
  // Camera RAW. sharp rejects these; the ffmpeg fallback handles them.
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.dng',
  '.orf',
  '.raf',
  '.rw2',
  '.pef',
  '.srw',
])

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.avi',
  '.mkv',
  '.webm',
  '.mpg',
  '.mpeg',
  '.3gp',
  '.wmv',
  '.flv',
])

export type ProcessResult = {
  type: AssetType
  width: number | null
  height: number | null
  duration: number | null
  /** Null when the file carried no capture time. Callers apply their own fallback. */
  capturedAt: Date | null
  exif: ExifData | null
  location: GeoPoint | null
  placeholderColor: string | null
  thumbnail: Buffer | null
  preview: Buffer | null
  error: string | null
}

export type PipelineOptions = {
  ffmpegPath: string
  ffprobePath: string
  /** `heif-dec` from libheif, used for tiled HEIC that ffmpeg mis-decodes. */
  heifDecPath: string
}

function emptyResult(type: AssetType, error: string | null = null): ProcessResult {
  return {
    type,
    width: null,
    height: null,
    duration: null,
    capturedAt: null,
    exif: null,
    location: null,
    placeholderColor: null,
    thumbnail: null,
    preview: null,
    error,
  }
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** EXIF dates carry no timezone, so treat them as UTC rather than guessing the server's. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

export class MediaPipeline {
  constructor(private readonly options: PipelineOptions) {}

  classify(mimeType: string, filename: string): AssetType | null {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    const ext = extname(filename).toLowerCase()
    if (IMAGE_EXTENSIONS.has(ext)) return 'image'
    if (VIDEO_EXTENSIONS.has(ext)) return 'video'
    return null
  }

  async process(
    path: string,
    input: { mimeType: string; filename: string },
  ): Promise<ProcessResult> {
    const type = this.classify(input.mimeType, input.filename)
    if (!type) return emptyResult('image', `Unsupported file type: ${input.mimeType}`)
    return type === 'video' ? this.processVideo(path) : this.processImage(path)
  }

  private async processImage(path: string): Promise<ProcessResult> {
    const result = emptyResult('image')

    // EXIF is independent of decoding, so read it even if the pixels turn out unreadable.
    await this.readExif(path, result)

    const decoded = await decodeImage(path, {
      ffmpegPath: this.options.ffmpegPath,
      heifDecPath: this.options.heifDecPath,
    })
    if (!decoded) return { ...result, error: 'Could not decode this image' }

    result.width = decoded.width
    result.height = decoded.height

    try {
      await this.renderDerivatives(decoded.source, result)
    } catch (error) {
      return { ...result, error: `Could not render this image: ${(error as Error).message}` }
    }

    return result
  }

  /**
   * `rotate()` with no argument bakes in EXIF orientation, so no client ever rotates.
   * An ffmpeg-decoded PNG is already upright, so re-applying orientation would rotate twice.
   */
  private async renderDerivatives(
    source: Sharp,
    result: ProcessResult,
    applyOrientation = true,
  ): Promise<void> {
    const oriented = () => (applyOrientation ? source.clone().rotate() : source.clone())

    const thumbnail = await oriented()
      .resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer()
    const preview = await oriented()
      .resize(PREVIEW_EDGE, PREVIEW_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()

    result.thumbnail = thumbnail
    result.preview = preview
    result.placeholderColor = await this.dominantColor(thumbnail)

    // Report the dimensions the viewer will actually see, not the stored orientation.
    const shown = await sharp(preview).metadata()
    if (shown.width && shown.height && result.width && result.height) {
      const rotated = shown.width > shown.height !== result.width > result.height
      if (rotated) [result.width, result.height] = [result.height, result.width]
    }
  }

  private async processVideo(path: string): Promise<ProcessResult> {
    const result = emptyResult('video')

    const probe = await this.probe(path)
    if (probe) {
      result.width = probe.width
      result.height = probe.height
      result.duration = probe.duration
      result.capturedAt = probe.creationTime
    }

    // Seek a little way in: the first frame of a phone video is often black.
    const seek = probe?.duration && probe.duration > 1 ? Math.min(probe.duration / 3, 3) : 0
    const frame = await decodeWithFfmpeg(path, this.options.ffmpegPath, seek)
    if (!frame) return { ...result, error: 'Could not read a frame from this video' }

    try {
      // The extracted frame is already upright; ffmpeg applied any rotation metadata.
      await this.renderDerivatives(sharp(frame), result, false)
    } catch (error) {
      return { ...result, error: `Could not render a poster frame: ${(error as Error).message}` }
    }

    return result
  }

  private async readExif(path: string, result: ProcessResult): Promise<void> {
    const parsed = await exifr.parse(path, { tiff: true, exif: true, gps: true }).catch(() => null)
    if (!parsed) return

    result.capturedAt =
      asDate(parsed.DateTimeOriginal) ?? asDate(parsed.CreateDate) ?? asDate(parsed.ModifyDate)

    result.exif = {
      make: parsed.Make ?? null,
      model: parsed.Model ?? null,
      lens: parsed.LensModel ?? null,
      fNumber: parsed.FNumber ?? null,
      exposureTime: parsed.ExposureTime ?? null,
      iso: parsed.ISO ?? null,
      focalLength: parsed.FocalLength ?? null,
      orientation: typeof parsed.Orientation === 'number' ? parsed.Orientation : null,
    }

    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      result.location = {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        altitude: typeof parsed.GPSAltitude === 'number' ? parsed.GPSAltitude : null,
        place: null,
      }
    }
  }

  private async dominantColor(webp: Buffer): Promise<string | null> {
    try {
      const { data } = await sharp(webp).resize(1, 1, { fit: 'cover' }).raw().toBuffer({
        resolveWithObject: true,
      })
      return toHex(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0)
    } catch {
      return null
    }
  }

  private async probe(path: string) {
    const proc = Bun.spawn(
      [
        this.options.ffprobePath,
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        path,
      ],
      { stdout: 'pipe', stderr: 'ignore' },
    )
    const text = await new Response(proc.stdout).text()
    if ((await proc.exited) !== 0) return null

    try {
      const data = JSON.parse(text) as {
        streams?: Array<Record<string, unknown>>
        format?: Record<string, unknown>
      }
      const video = data.streams?.find((s) => s.codec_type === 'video')
      const duration = Number(data.format?.duration ?? video?.duration)
      const creation =
        (data.format?.tags as Record<string, string> | undefined)?.creation_time ??
        (video?.tags as Record<string, string> | undefined)?.creation_time
      return {
        width: typeof video?.width === 'number' ? video.width : null,
        height: typeof video?.height === 'number' ? video.height : null,
        duration: Number.isFinite(duration) ? duration : null,
        creationTime: creation ? asDate(creation) : null,
      }
    } catch {
      return null
    }
  }
}
