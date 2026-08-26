import type { Asset } from '@imogen/shared'
import type { AssetRow } from '../db/schema.ts'

/** Turns a database row into the shape the API contract promises. */
export function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    ownerId: row.ownerId,
    type: row.type,
    status: row.status,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    checksum: row.checksum,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    duration: row.duration,
    capturedAt: row.capturedAt.toISOString(),
    capturedAtIsExact: row.capturedAtIsExact,
    capturedAtOriginal: row.capturedAtOriginal?.toISOString() ?? null,
    capturedAtOriginalIsExact: row.capturedAtOriginalIsExact ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    favorite: row.favorite,
    archived: row.archived,
    description: row.description,
    exif: (row.exif as Asset['exif']) ?? null,
    location:
      row.latitude !== null && row.longitude !== null
        ? {
            latitude: row.latitude,
            longitude: row.longitude,
            altitude: row.altitude,
            place: row.place,
          }
        : null,
    placeholderColor: row.placeholderColor,
    livePhotoVideoId: row.livePhotoVideoId,
    deviceAssetId: row.deviceAssetId,
  }
}
