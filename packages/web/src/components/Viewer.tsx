import type { Asset } from '@imogen/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { formatAperture, formatBytes, formatExact, formatShutter } from '../lib/format.ts'

type Props = {
  asset: Asset
  hasPrevious: boolean
  hasNext: boolean
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  onToggleFavorite: (asset: Asset) => void
  onTrash: (asset: Asset) => void
}

const IDLE_MS = 2600

export function Viewer({
  asset,
  hasPrevious,
  hasNext,
  onClose,
  onPrevious,
  onNext,
  onToggleFavorite,
  onTrash,
}: Props) {
  const [showInfo, setShowInfo] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Chrome fades out when the pointer rests, so nothing sits on top of the photograph
  // for longer than it is useful.
  const wake = useCallback(() => {
    setChromeVisible(true)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setChromeVisible(false), IDLE_MS)
  }, [])

  useEffect(() => {
    wake()
    return () => clearTimeout(idleTimer.current)
  }, [wake])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return showInfo ? setShowInfo(false) : onClose()
      if (event.key === 'ArrowLeft') return onPrevious()
      if (event.key === 'ArrowRight') return onNext()
      if (event.key === 'i') return setShowInfo((v) => !v)
      if (event.key === 'f') return onToggleFavorite(asset)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [asset, onClose, onNext, onPrevious, onToggleFavorite, showInfo])

  // Swipe between photos on a phone, which is how people actually flick through a roll.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current
    const touch = event.changedTouches[0]
    if (!start || !touch) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) dx > 0 ? onPrevious() : onNext()
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose()
    touchStart.current = null
  }

  const ambient = asset.placeholderColor ?? '#000000'

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onMouseMove={wake}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={asset.originalFilename}
    >
      {/*
       * The photograph lights its own room. A soft wash of the image's dominant colour
       * sits behind it, so a warm photo warms the surround instead of being stranded on
       * a black rectangle.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-colors duration-700"
        style={{
          background: `radial-gradient(120% 90% at 50% 45%, ${ambient}59 0%, ${ambient}1f 45%, transparent 78%)`,
        }}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 items-center justify-center p-2 sm:p-6">
          <img
            key={asset.id}
            src={`/api/v1/assets/${asset.id}/preview`}
            alt={asset.description ?? asset.originalFilename}
            className="max-h-full max-w-full object-contain drop-shadow-[0_8px_40px_rgba(0,0,0,0.5)]"
          />

          {hasPrevious && (
            <NavButton side="left" onClick={onPrevious} visible={chromeVisible} label="Previous" />
          )}
          {hasNext && (
            <NavButton side="right" onClick={onNext} visible={chromeVisible} label="Next" />
          )}
        </div>

        {showInfo && <InfoPanel asset={asset} onClose={() => setShowInfo(false)} />}
      </div>

      <header
        className="absolute inset-x-0 top-0 flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300"
        style={{ opacity: chromeVisible ? 1 : 0 }}
      >
        <IconButton onClick={onClose} label="Close">
          <path d="M6 6l12 12M18 6L6 18" />
        </IconButton>

        <p className="ml-1 min-w-0 flex-1 truncate text-sm text-white/90">
          {asset.originalFilename}
        </p>

        <IconButton
          onClick={() => onToggleFavorite(asset)}
          label={asset.favorite ? 'Remove from favourites' : 'Add to favourites'}
          active={asset.favorite}
        >
          <path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z" />
        </IconButton>
        <IconButton onClick={() => setShowInfo((v) => !v)} label="Photo details" active={showInfo}>
          <path d="M12 11v6M12 7.5v.01" />
        </IconButton>
        <a
          href={`/api/v1/assets/${asset.id}/download`}
          download
          aria-label="Download original"
          className="grid h-9 w-9 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
        </a>
        <IconButton onClick={() => onTrash(asset)} label="Move to trash">
          <path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" />
        </IconButton>
      </header>
    </div>
  )
}

function NavButton({
  side,
  onClick,
  visible,
  label,
}: {
  side: 'left' | 'right'
  onClick: () => void
  visible: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 hidden -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/75 sm:grid ${
        side === 'left' ? 'left-4' : 'right-4'
      }`}
      style={{ opacity: visible ? 1 : 0 }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d={side === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

function IconButton({
  onClick,
  label,
  active,
  children,
}: {
  onClick: () => void
  label: string
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`grid h-9 w-9 place-items-center rounded-full transition hover:bg-white/15 ${
        active ? 'text-safelight' : 'text-white/85 hover:text-white'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        {children}
      </svg>
    </button>
  )
}

function InfoPanel({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const exif = asset.exif
  const rows: Array<[string, string]> = [
    ['Taken', formatExact(asset.capturedAt)],
    ['File', asset.originalFilename],
    ['Size', formatBytes(asset.sizeBytes)],
  ]
  if (asset.width && asset.height) rows.push(['Pixels', `${asset.width} × ${asset.height}`])
  if (exif?.make) rows.push(['Camera', `${exif.make} ${exif.model ?? ''}`.trim()])
  if (exif?.lens) rows.push(['Lens', exif.lens])
  if (exif?.focalLength) rows.push(['Focal length', `${Math.round(exif.focalLength)}mm`])
  if (exif?.fNumber) rows.push(['Aperture', formatAperture(exif.fNumber)])
  if (exif?.exposureTime) rows.push(['Shutter', formatShutter(exif.exposureTime)])
  if (exif?.iso) rows.push(['ISO', String(exif.iso)])
  if (asset.location) {
    rows.push([
      'Location',
      asset.location.place ??
        `${asset.location.latitude.toFixed(5)}, ${asset.location.longitude.toFixed(5)}`,
    ])
  }
  if (!asset.capturedAtIsExact) {
    rows.push(['Date source', 'Estimated — this file carried no capture time'])
  }

  return (
    <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-sm overflow-y-auto border-l border-white/10 bg-black/85 p-5 backdrop-blur-xl sm:relative sm:bg-black/60">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="heading-display text-base text-white">Details</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/15 hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/* EXIF is data, so it is set as data: monospaced, aligned, not dressed as prose. */}
      <dl className="space-y-3">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[7.5rem_1fr] gap-3">
            <dt className="label-micro pt-0.5 text-white/45">{key}</dt>
            <dd className="font-mono text-[13px] leading-relaxed break-words text-white/90">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {asset.description && (
        <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-relaxed text-white/80">
          {asset.description}
        </p>
      )}
    </aside>
  )
}
