import type { Person } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState.tsx'
import { imogen } from '../lib/client.ts'

/**
 * Everyone the library has grouped.
 *
 * Unnamed people are shown alongside named ones rather than hidden away: an unnamed
 * cluster is exactly the thing a person is being invited to name, and burying it behind
 * a filter is how face grouping ends up feeling like it did nothing.
 */
export function People() {
  const queryClient = useQueryClient()
  const [selecting, setSelecting] = useState<Set<string>>(new Set())

  const { data: status } = useQuery({
    queryKey: ['face-status'],
    queryFn: () => imogen.people.status(),
    // While a scan is running the counts climb; stop polling once it settles.
    refetchInterval: (query) => (query.state.data?.pending ? 4000 : false),
  })

  const { data: people, isPending } = useQuery({
    queryKey: ['people'],
    queryFn: () => imogen.people.list(),
    enabled: status?.enabled === true,
    refetchInterval: status?.pending ? 4000 : false,
  })

  const merge = useMutation({
    mutationFn: (ids: string[]) => imogen.people.merge(ids[0]!, ids.slice(1)),
    onSuccess: () => {
      setSelecting(new Set())
      void queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })

  if (!status) return <div className="h-40 animate-pulse rounded-lg bg-sunken" />
  if (!status.enabled) return <FacesOff status={status} />

  const scanning = status.pending > 0

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading-display text-2xl md:text-[28px]">People</h1>
        {scanning && (
          <span className="label-micro">
            Looking through {status.pending.toLocaleString()} more photos
          </span>
        )}
      </div>

      {isPending ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed skeleton never reorders
              key={`person-skeleton-${i}`}
              className="aspect-square animate-pulse rounded-full bg-sunken"
            />
          ))}
        </div>
      ) : people && people.length > 0 ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
          {people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              selected={selecting.has(person.id)}
              selecting={selecting.size > 0}
              onToggle={() =>
                setSelecting((current) => {
                  const next = new Set(current)
                  if (next.has(person.id)) next.delete(person.id)
                  else next.add(person.id)
                  return next
                })
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          headline={scanning ? 'Still looking' : 'Nobody found yet'}
          body={
            scanning
              ? 'Faces appear here as your library is scanned. It runs in the background, so you can carry on.'
              : 'No faces have been found in your photos. Vaulted photos are never scanned.'
          }
        />
      )}

      {selecting.size > 1 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:pb-6">
          <div className="surface-panel flex items-center gap-1 rounded-full px-2 py-1.5">
            <span className="px-3 font-mono text-[13px]">{selecting.size} selected</span>
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
            <button
              type="button"
              onClick={() => merge.mutate([...selecting])}
              className="rounded-full px-3 py-1.5 text-sm transition hover:bg-sunken"
            >
              These are the same person
            </button>
            <button
              type="button"
              onClick={() => setSelecting(new Set())}
              aria-label="Clear selection"
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
            >
              <svg
                aria-hidden="true"
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
      )}
    </>
  )
}

function PersonCard({
  person,
  selected,
  selecting,
  onToggle,
}: {
  person: Person
  selected: boolean
  selecting: boolean
  onToggle: () => void
}) {
  const body = (
    <>
      <div
        className={`relative mb-2 aspect-square overflow-hidden rounded-full bg-sunken transition ${
          selected ? 'ring-2 ring-safelight ring-offset-2 ring-offset-paper' : ''
        }`}
      >
        {person.coverFaceId ? (
          <img
            src={`/api/v1/people/thumbnail/${person.coverFaceId}`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              className="h-7 w-7 text-line"
            >
              <circle cx="12" cy="9" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </div>
        )}
      </div>
      <p
        className={`truncate text-center text-sm ${person.name ? 'font-medium' : 'text-muted italic'}`}
      >
        {person.name ?? 'Unnamed'}
      </p>
      <p className="label-micro mt-0.5 text-center">
        {person.photoCount} {person.photoCount === 1 ? 'photo' : 'photos'}
      </p>
    </>
  )

  // While selecting, a tap chooses rather than navigates — merging is the whole point.
  if (selecting) {
    return (
      <button type="button" onClick={onToggle} className="block w-full text-left">
        {body}
      </button>
    )
  }

  return (
    <div className="group relative">
      <Link to={`/people/${person.id}`} className="block">
        {body}
      </Link>
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Select ${person.name ?? 'this person'}`}
        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border border-white/70 bg-black/30 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5">
          <path
            d="M4 10.5l4 4 8-9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}

/** What the page says before anyone has turned the feature on. */
function FacesOff({ status }: { status: { modelsReady: boolean } }) {
  const queryClient = useQueryClient()
  const enable = useMutation({
    mutationFn: () => imogen.people.setEnabled(true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['face-status'] }),
  })

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="heading-display mb-3 text-2xl">Find people in your photos</h1>
      <p className="mb-4 text-sm leading-relaxed text-muted">
        imogen can look for faces and group the photos each person appears in. It runs entirely on
        this server — nothing is sent anywhere.
      </p>
      <ul className="mb-6 space-y-2 text-sm leading-relaxed text-muted">
        <li>· Photos in your vault are never scanned.</li>
        <li>· Nobody is named until you name them.</li>
        {!status.modelsReady && (
          <li>· Turning this on downloads about 190 MB of recognition models.</li>
        )}
      </ul>
      <button
        type="button"
        onClick={() => enable.mutate()}
        disabled={enable.isPending}
        className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
      >
        {enable.isPending ? 'Starting' : 'Turn on face grouping'}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        You can turn it off again at any time. Only an administrator can change this.
      </p>
    </div>
  )
}
