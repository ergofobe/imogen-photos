type Action = { label: string; onClick: () => void; icon: string }

/**
 * Appears only while something is selected, and says exactly what will happen. Every
 * action keeps the same name it will use in its confirmation.
 */
export function SelectionBar({
  count,
  onClear,
  onSelectAll,
  actions,
}: {
  count: number
  onClear: () => void
  onSelectAll: () => void
  actions: Action[]
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:pb-6">
      <div className="surface-panel flex items-center gap-1 rounded-full px-2 py-1.5">
        <span className="px-3 font-mono text-[13px] tabular-nums">{count} selected</span>

        <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />

        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-sunken hover:text-ink"
        >
          Select all
        </button>

        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d={action.icon} />
            </svg>
            {action.label}
          </button>
        ))}

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
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
    </div>
  )
}
