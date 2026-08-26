/** An empty screen is an invitation to act, so it says what to do, not how it feels. */
export function EmptyState({
  headline,
  body,
  action,
}: {
  headline: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      {/* An empty frame: the aperture with nothing behind it yet. */}
      <svg viewBox="0 0 64 64" aria-hidden="true" className="mb-6 h-12 w-12 text-line">
        <rect
          x="8"
          y="8"
          width="48"
          height="48"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <circle cx="32" cy="32" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <h2 className="heading-display mb-2 text-lg">{headline}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
