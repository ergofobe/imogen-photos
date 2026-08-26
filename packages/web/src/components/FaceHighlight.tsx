import type { Asset, DetectedFace } from '@imogen/shared'
import { useEffect, useState } from 'react'

/**
 * Draws a frame around one face in the displayed photo.
 *
 * Face coordinates are stored in the pixels of the upright original; the viewer shows a
 * resized preview, letterboxed inside whatever space is going. So the box is positioned
 * from the rendered image's own bounding box, measured at the moment it is needed, which
 * survives every zoom, rotation of the window, and change of layout without a resize
 * listener that only fires sometimes.
 */
/** How far the ring is let out beyond the detected box, per side. */
const PADDING = 0.12

export function FaceHighlight({
  face,
  asset,
  imageRef,
}: {
  face: DetectedFace | null
  asset: Asset
  imageRef: React.RefObject<HTMLImageElement | null>
}) {
  const [box, setBox] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    const image = imageRef.current
    if (!face || !image || !asset.width || !asset.height) return setBox(null)

    const place = () => {
      const rect = image.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      // The preview keeps the original's proportions, so one scale factor covers both
      // axes — taken from width, which is never zero for a photo that has rendered.
      const scale = rect.width / asset.width!

      // The detector's box stops at the face. An ellipse drawn inside it would cut the
      // chin and forehead off, so the ring is let out a little to sit around the face.
      const padX = face.width * scale * PADDING
      const padY = face.height * scale * PADDING

      setBox({
        left: rect.left + face.x * scale - padX,
        top: rect.top + face.y * scale - padY,
        width: face.width * scale + padX * 2,
        height: face.height * scale + padY * 2,
      })
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [face, asset.width, asset.height, imageRef])

  if (!face || !box) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-10 rounded-full border-2 border-dashed border-safelight"
      style={{
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        // A dark inner edge keeps the amber legible against a pale cheek or a bright sky.
        boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / 0.35)',
      }}
    />
  )
}
