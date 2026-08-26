import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState } from '../components/EmptyState.tsx'
import { PhotoGrid } from '../components/PhotoGrid.tsx'
import { SharePanel } from '../components/SharePanel.tsx'
import { Viewer } from '../components/Viewer.tsx'
import { useViewerParam } from '../hooks/useViewerParam.ts'
import { imogen } from '../lib/client.ts'

export function AlbumDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { openId, open: openPhoto, replace: showPhoto, close: closePhoto } = useViewerParam()
  const [sharing, setSharing] = useState(false)

  const { data: album, isPending } = useQuery({
    queryKey: ['album', id],
    queryFn: () => imogen.albums.get(id),
  })

  const remove = useMutation({
    mutationFn: () => imogen.albums.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['albums'] })
      navigate('/albums')
    },
  })

  if (isPending || !album) return <div className="h-40 animate-pulse rounded-lg bg-sunken" />

  const assets = album.assets
  const openIndex = openId ? assets.findIndex((a) => a.id === openId) : -1

  return (
    <>
      <Link
        to="/albums"
        className="label-micro mb-4 inline-flex items-center gap-1.5 hover:text-ink"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="h-3.5 w-3.5"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Albums
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-display text-2xl md:text-[28px]">{album.name}</h1>
          <p className="label-micro mt-1">
            {album.assetCount} {album.assetCount === 1 ? 'photo' : 'photos'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSharing((open) => !open)}
            aria-expanded={sharing}
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            {album.shareSlug ? 'Sharing' : 'Share'}
          </button>
          <button
            type="button"
            onClick={() => remove.mutate()}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            Delete album
          </button>
        </div>
      </div>

      {sharing && (
        <div className="mb-6 max-w-xl">
          <SharePanel target={{ kind: 'album', id }} onClose={() => setSharing(false)} />
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState
          headline="This album is empty"
          body="Select photos in your timeline and add them here."
        />
      ) : (
        <PhotoGrid
          assets={assets}
          selected={new Set()}
          onOpen={(asset) => openPhoto(asset.id)}
          onToggleSelect={() => {}}
        />
      )}

      {openIndex >= 0 && assets[openIndex] && (
        <Viewer
          asset={assets[openIndex]}
          hasPrevious={openIndex > 0}
          hasNext={openIndex < assets.length - 1}
          onClose={() => closePhoto()}
          onPrevious={() => showPhoto(assets[openIndex - 1]?.id ?? '')}
          onNext={() => showPhoto(assets[openIndex + 1]?.id ?? '')}
          onToggleFavorite={(asset) => {
            void imogen.assets
              .update(asset.id, { favorite: !asset.favorite })
              .then(() => queryClient.invalidateQueries({ queryKey: ['album', id] }))
          }}
          onTrash={(asset) => {
            closePhoto()
            void imogen.assets
              .trash([asset.id])
              .then(() => queryClient.invalidateQueries({ queryKey: ['album', id] }))
          }}
        />
      )}
    </>
  )
}
