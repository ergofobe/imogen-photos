import type { Asset } from '@imogen/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDayHeading, groupByDay } from '../lib/format.ts'
import { aspectOf, justify } from '../lib/justify.ts'
import { PhotoTile } from './PhotoTile.tsx'

type Props = {
  assets: Asset[]
  selected: Set<string>
  onOpen: (asset: Asset) => void
  onToggleSelect: (asset: Asset, shiftKey: boolean) => void
  onReachEnd?: () => void
  loadingMore?: boolean
}

const GAP = 4
const SECTION_GAP = 44

/** Row height scales with the viewport: a phone wants fewer, larger photos per row. */
function targetHeightFor(width: number): number {
  if (width < 480) return 132
  if (width < 900) return 168
  if (width < 1600) return 208
  return 240
}

export function PhotoGrid({
  assets,
  selected,
  onOpen,
  onToggleSelect,
  onReachEnd,
  loadingMore,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Fetch the next page slightly before the user arrives, so scrolling never stalls.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !onReachEnd) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) onReachEnd()
      },
      { rootMargin: '1200px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onReachEnd])

  const sections = useMemo(() => {
    if (width <= 0) return []
    const targetHeight = targetHeightFor(width)
    return groupByDay(assets).map(([day, items]) => ({
      day,
      capturedAt: items[0]!.capturedAt,
      count: items.length,
      rows: justify(
        items.map((asset) => ({ id: asset.id, aspect: aspectOf(asset) })),
        { width, targetHeight, gap: GAP },
      ),
    }))
  }, [assets, width])

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
  const selecting = selected.size > 0

  return (
    <div ref={containerRef} className="w-full">
      {sections.map((section) => (
        <section key={section.day} style={{ marginBottom: SECTION_GAP }}>
          <header className="sticky top-0 z-10 -mx-4 mb-2.5 bg-paper/85 px-4 py-2 backdrop-blur-md">
            <h2 className="heading-display text-[15px]">{formatDayHeading(section.capturedAt)}</h2>
          </header>

          <div style={{ position: 'relative', height: heightOf(section.rows) }}>
            {section.rows.map((row) => (
              <div
                key={row.top}
                className="absolute left-0 flex"
                style={{ top: row.top, height: row.height, gap: GAP }}
              >
                {row.items.map((item) => {
                  const asset = byId.get(item.id)
                  if (!asset) return null
                  return (
                    <PhotoTile
                      key={item.id}
                      asset={asset}
                      width={item.width}
                      height={item.height}
                      selected={selected.has(item.id)}
                      selecting={selecting}
                      onOpen={onOpen}
                      onToggleSelect={onToggleSelect}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div ref={sentinelRef} className="h-px" />
      {loadingMore && <p className="label-micro py-8 text-center">Loading more</p>}
    </div>
  )
}

function heightOf(rows: Array<{ top: number; height: number }>): number {
  const last = rows.at(-1)
  return last ? last.top + last.height : 0
}
