import type { Asset } from '@imogen/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { imogen } from '../lib/client.ts'
import { formatExact } from '../lib/format.ts'

/** Query keys whose data holds assets, and so goes stale when a date changes. */
const ASSET_QUERIES = new Set(['assets', 'album', 'person', 'vault-assets'])

/**
 * When the photograph was taken, and a way to say so when the file got it wrong.
 *
 * Scans and stripped-down files arrive dated the day they were uploaded, which drops
 * them at the wrong end of the timeline. Correcting the date here changes only this
 * library's record of it: the uploaded file is never rewritten, so the camera's own
 * EXIF survives, and the date the photo arrived with can be put back at any point.
 */
export function CaptureDate({ asset, editable }: { asset: Asset; editable: boolean }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (query) => ASSET_QUERIES.has(query.queryKey[0] as string),
    })

  const save = useMutation({
    mutationFn: (value: string) =>
      imogen.assets.update(asset.id, { capturedAt: new Date(value).toISOString() }),
    onSuccess: () => {
      setEditing(false)
      void refresh()
    },
  })

  const revert = useMutation({
    mutationFn: () => imogen.assets.update(asset.id, { resetCapturedAt: true }),
    onSuccess: () => {
      setEditing(false)
      void refresh()
    },
  })

  const corrected = asset.capturedAtOriginal !== null

  if (editing) {
    return (
      <Row>
        <input
          ref={(node) => node?.focus()}
          type="datetime-local"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false)
            if (event.key === 'Enter' && draft) save.mutate(draft)
          }}
          className="w-full rounded-md border border-white/20 bg-white/10 px-2 py-1 font-mono text-[13px] text-white outline-none focus:border-safelight [color-scheme:dark]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => draft && save.mutate(draft)}
            disabled={save.isPending || !draft}
            className="rounded-md bg-white/15 px-2.5 py-1 text-xs text-white transition hover:bg-white/25 disabled:opacity-50"
          >
            {save.isPending ? 'Saving' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-1 text-xs text-white/50 transition hover:text-white"
          >
            Cancel
          </button>
          {corrected && (
            <button
              type="button"
              onClick={() => revert.mutate()}
              disabled={revert.isPending}
              className="px-1 text-xs text-white/50 transition hover:text-white disabled:opacity-50"
            >
              Use the file’s date
            </button>
          )}
          {(save.isError || revert.isError) && (
            <span className="text-xs text-red-300">Could not save</span>
          )}
        </div>
      </Row>
    )
  }

  const start = () => {
    setDraft(toLocalInput(asset.capturedAt))
    setEditing(true)
  }

  return (
    <Row>
      {editable ? (
        <button
          type="button"
          onClick={start}
          title="Correct this date"
          className="text-left font-mono text-[13px] leading-relaxed break-words text-white/90 underline decoration-white/20 underline-offset-4 transition hover:decoration-white/60"
        >
          {formatExact(asset.capturedAt)}
        </button>
      ) : (
        formatExact(asset.capturedAt)
      )}

      {corrected && (
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Edited — the file said {formatExact(asset.capturedAtOriginal!)}
        </p>
      )}
      {!corrected && !asset.capturedAtIsExact && (
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Estimated — this file carried no capture time
        </p>
      )}
    </Row>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3">
      <dt className="label-micro pt-0.5 text-white/45">Taken</dt>
      <dd className="font-mono text-[13px] leading-relaxed break-words text-white/90">
        {children}
      </dd>
    </div>
  )
}

/**
 * An ISO instant as the wall-clock string `datetime-local` expects.
 *
 * The input has no notion of zone, so it is fed local time and read back the same way —
 * which is what someone correcting a date means: the time it was on the clock there.
 */
function toLocalInput(iso: string): string {
  const at = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}
