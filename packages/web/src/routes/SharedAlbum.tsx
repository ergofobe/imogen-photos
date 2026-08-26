import type { Album, Asset } from '@imogen/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { PhotoGrid } from '../components/PhotoGrid.tsx'
import { Viewer } from '../components/Viewer.tsx'
import { Wordmark } from '../components/Wordmark.tsx'
import { useViewerParam } from '../hooks/useViewerParam.ts'

type ShareResponse =
  | { locked: true }
  | { locked: false; album: Album & { assets: Asset[] }; allowDownload: boolean }

/** A public album. No account, no session — the slug is the only credential. */
export function SharedAlbum() {
  const { slug = '' } = useParams()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { openId, open: openPhoto, replace: showPhoto, close: closePhoto } = useViewerParam()

  const { data, refetch, isPending } = useQuery<ShareResponse>({
    queryKey: ['share', slug],
    queryFn: async () => {
      const response = await fetch(`/api/v1/share/${slug}`)
      if (response.status === 401) return { locked: true }
      if (!response.ok) throw new Error('This link is not valid, or it has expired')
      return response.json() as Promise<ShareResponse>
    },
    retry: false,
  })

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch(`/api/v1/share/${slug}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!response.ok) {
      setError('That password is not correct')
      return
    }
    void refetch()
  }

  if (isPending) return <div className="grid min-h-dvh place-items-center" />

  if (!data || data.locked) {
    return (
      <div className="grid min-h-dvh place-items-center px-5">
        <form onSubmit={unlock} className="w-full max-w-[20rem]">
          <div className="mb-7">
            <Wordmark />
          </div>
          <h1 className="heading-display mb-2 text-xl">This album needs a password</h1>
          <p className="mb-6 text-sm text-muted">Ask whoever shared the link for the password.</p>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
            className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-safelight"
          />
          {error && <p className="mb-3 text-sm text-safelight">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
          >
            Open album
          </button>
        </form>
      </div>
    )
  }

  const assets = data.album.assets
  const openIndex = openId ? assets.findIndex((a) => a.id === openId) : -1

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
      <header className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="heading-display text-2xl md:text-[28px]">{data.album.name}</h1>
          <p className="label-micro mt-1">
            {assets.length} {assets.length === 1 ? 'photo' : 'photos'} · shared album
          </p>
        </div>
        <Wordmark compact />
      </header>

      <PhotoGrid
        assets={assets}
        selected={new Set()}
        onOpen={(asset) => openPhoto(asset.id)}
        onToggleSelect={() => {}}
      />

      {openIndex >= 0 && assets[openIndex] && (
        <Viewer
          asset={assets[openIndex]}
          hasPrevious={openIndex > 0}
          hasNext={openIndex < assets.length - 1}
          onClose={() => closePhoto()}
          onPrevious={() => showPhoto(assets[openIndex - 1]?.id ?? '')}
          onNext={() => showPhoto(assets[openIndex + 1]?.id ?? '')}
          onToggleFavorite={() => {}}
          onTrash={() => {}}
        />
      )}
    </div>
  )
}
