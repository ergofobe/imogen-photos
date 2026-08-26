export type JustifyInput = { id: string; aspect: number }

export type PlacedItem = { id: string; width: number; height: number }

export type JustifiedRow = {
  items: PlacedItem[]
  height: number
  /** Distance from the top of the grid, so a virtualiser can position rows absolutely. */
  top: number
  gapTotal: number
}

export type JustifyOptions = {
  width: number
  /** The height a row aims for before being justified to the container width. */
  targetHeight: number
  gap: number
  maxHeight?: number
}

/** A still-processing upload has no dimensions yet; assume landscape rather than collapse. */
const FALLBACK_ASPECT = 3 / 2

/**
 * Lays photographs out in justified rows, the way a contact sheet or a picture editor's
 * page does: every photo keeps its own proportions, and each full row is scaled to meet
 * the container edges exactly.
 *
 * Cropping everything to squares would be far simpler, and it is what most grids do —
 * but it throws away the composition the photographer chose, which is the one thing a
 * photo library exists to preserve.
 */
export function justify(items: JustifyInput[], options: JustifyOptions): JustifiedRow[] {
  const { width, targetHeight, gap } = options
  const maxHeight = options.maxHeight ?? targetHeight * 1.6
  if (width <= 0 || items.length === 0) return []

  const rows: JustifiedRow[] = []
  let current: JustifyInput[] = []
  let aspectSum = 0
  let top = 0

  const commit = (justifyToWidth: boolean) => {
    if (current.length === 0) return

    const gapTotal = gap * (current.length - 1)
    const available = width - gapTotal
    // Scaling to fill: row height is the available width divided by the summed aspects.
    let height = justifyToWidth ? available / aspectSum : targetHeight
    height = Math.min(height, maxHeight)

    const placed: PlacedItem[] = current.map((item) => {
      const aspect = item.aspect > 0 ? item.aspect : FALLBACK_ASPECT
      return { id: item.id, width: aspect * height, height }
    })

    // Absorb rounding into the last item so the row edge is exact, not a hair short.
    if (justifyToWidth && placed.length > 0) {
      const used = placed.reduce((sum, p) => sum + p.width, 0)
      const drift = available - used
      placed[placed.length - 1]!.width += drift
    }

    rows.push({ items: placed, height, top, gapTotal })
    top += height + gap
    current = []
    aspectSum = 0
  }

  for (const item of items) {
    const aspect = item.aspect > 0 ? item.aspect : FALLBACK_ASPECT
    current.push(item)
    aspectSum += aspect

    // A row is full once scaling it to the container would drop it below the target height.
    const gapTotal = gap * (current.length - 1)
    const projectedHeight = (width - gapTotal) / aspectSum
    if (projectedHeight <= targetHeight) commit(true)
  }

  // The final row is left at its natural height rather than stretched: two photos blown
  // up to fill a five-photo row is the tell of a grid that does not know it has run out.
  commit(false)

  return rows
}

/** The aspect ratio to lay an asset out with, before its image has loaded. */
export function aspectOf(asset: { width: number | null; height: number | null }): number {
  if (!asset.width || !asset.height) return FALLBACK_ASPECT
  return asset.width / asset.height
}
