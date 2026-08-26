/**
 * The mark is a print with a lens aperture cut through it — the two things this app is
 * about, in one shape. Archivo's width axis is pushed out for the wordmark so it reads
 * as exhibition signage rather than as body text.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" aria-hidden="true" className="h-6 w-6">
        <mask id="wordmark-aperture">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="32" cy="32" r="11" fill="#000" />
        </mask>
        <rect
          x="12"
          y="12"
          width="40"
          height="40"
          rx="5"
          fill="var(--color-safelight)"
          mask="url(#wordmark-aperture)"
        />
        <circle cx="32" cy="32" r="6.5" fill="var(--color-safelight)" />
      </svg>
      {!compact && <span className="wordmark text-[17px]">imogen</span>}
    </span>
  )
}
