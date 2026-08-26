import { useEffect } from 'react'

/**
 * Asks before something that is awkward to undo.
 *
 * Deliberately not used for everything. A dialog in front of a harmless action teaches
 * people to dismiss dialogs without reading them, which is exactly the habit you do
 * not want them to have when one finally matters.
 *
 * The confirming button says what it will do rather than "OK", so the last thing read
 * before the click is the thing that is about to happen.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
      // Enter does not confirm. Reaching this dialog mid-keystroke should not be
      // enough to get through it.
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="surface-panel w-full max-w-sm rounded-xl p-5"
      >
        <h2 className="heading-display mb-2 text-base">{title}</h2>
        <p className="mb-5 text-sm leading-relaxed text-muted">{body}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            Keep
          </button>
          <button
            type="button"
            ref={(node) => node?.focus()}
            onClick={onConfirm}
            className={
              destructive
                ? 'rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-500 transition hover:bg-red-500/10'
                : 'rounded-lg bg-ink px-3 py-1.5 text-sm text-paper transition hover:opacity-90'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
