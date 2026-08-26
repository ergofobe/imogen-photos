import type { Album } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState.tsx'
import { imogen } from '../lib/client.ts'

export function Albums() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const { data: albums, isPending } = useQuery({
    queryKey: ['albums'],
    queryFn: () => imogen.albums.list(),
  })

  const create = useMutation({
    mutationFn: (albumName: string) => imogen.albums.create({ name: albumName }),
    onSuccess: () => {
      setCreating(false)
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['albums'] })
    },
  })

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="heading-display text-2xl md:text-[28px]">Albums</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
        >
          New album
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) create.mutate(name.trim())
          }}
          className="mb-6 flex gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Album name"
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-safelight"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-ink"
          >
            Cancel
          </button>
        </form>
      )}

      {isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-sunken" />
          ))}
        </div>
      ) : albums && albums.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      ) : (
        <EmptyState
          headline="No albums yet"
          body="Albums gather photos that belong together — a trip, a person, a year. Photos stay in your timeline either way."
        />
      )}
    </>
  )
}

function AlbumCard({ album }: { album: Album }) {
  return (
    <Link to={`/albums/${album.id}`} className="group block">
      <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-sunken">
        {album.coverAssetId ? (
          <img
            src={`/api/v1/assets/${album.coverAssetId}/thumbnail`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              className="h-7 w-7 text-line"
            >
              <path d="M4 8h7l2 2h7v9H4zM7 8V5h6v3" />
            </svg>
          </div>
        )}
      </div>
      <p className="truncate text-sm font-medium">{album.name}</p>
      <p className="label-micro mt-0.5">
        {album.assetCount} {album.assetCount === 1 ? 'photo' : 'photos'}
        {album.shareSlug ? ' · shared' : ''}
      </p>
    </Link>
  )
}
