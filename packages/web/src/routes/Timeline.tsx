import type { Asset, AssetQuery } from '@imogen/shared'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlbumPicker } from '../components/AlbumPicker.tsx'
import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { EmptyState } from '../components/EmptyState.tsx'
import { PhotoGrid } from '../components/PhotoGrid.tsx'
import { SelectionBar } from '../components/SelectionBar.tsx'
import { Viewer } from '../components/Viewer.tsx'
import { useSelection } from '../hooks/useSelection.ts'
import { useViewerParam } from '../hooks/useViewerParam.ts'
import { imogen } from '../lib/client.ts'

type Props = {
  title: string
  query?: Partial<AssetQuery>
  empty: { headline: string; body: string; action?: React.ReactNode }
  /** Trash shows restore rather than delete. */
  mode?: 'library' | 'trash'
}

export function Timeline({ title, query = {}, empty, mode = 'library' }: Props) {
  const queryClient = useQueryClient()
  const { openId, open: openPhoto, replace: showPhoto, close: closePhoto } = useViewerParam()

  const key = ['assets', query] as const
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      imogen.assets.list({ ...query, limit: 120, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    /*
     * An upload lands as `pending` and is thumbnailed by a background worker, so the
     * timeline has to find out when that finishes. Polling runs only while something is
     * actually in flight and stops the moment the library is settled — no upload, no
     * traffic.
     */
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? []
      const working = pages.some((page) =>
        page.items.some((asset) => asset.status === 'pending' || asset.status === 'processing'),
      )
      return working ? 2000 : false
    },
  })

  const assets = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const ids = useMemo(() => assets.map((a) => a.id), [assets])
  const { selected, toggle, clear, selectAll } = useSelection(ids)
  const [pickingAlbum, setPickingAlbum] = useState(false)
  const [confirmingTrash, setConfirmingTrash] = useState<string[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // The confirmation says what happened and then gets out of the way.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['assets'] })

  const favourite = useMutation({
    mutationFn: (asset: Asset) => imogen.assets.update(asset.id, { favorite: !asset.favorite }),
    onSuccess: refresh,
  })

  const trash = useMutation({
    mutationFn: (assetIds: string[]) => imogen.assets.trash(assetIds),
    onSuccess: () => {
      clear()
      refresh()
    },
  })

  /**
   * Moving into the vault needs the vault open. If it is locked we send the user to the
   * vault to unlock rather than asking for a passphrase inside a toolbar.
   */
  const navigate = useNavigate()
  const toVault = useMutation({
    mutationFn: async (assetIds: string[]) => {
      const status = await imogen.vault.status()
      if (!status.configured || !status.unlocked) {
        navigate('/vault')
        return { moved: 0 }
      }
      return imogen.vault.moveIn(assetIds)
    },
    onSuccess: () => {
      clear()
      refresh()
    },
  })

  const restore = useMutation({
    mutationFn: (assetIds: string[]) => imogen.assets.restore(assetIds),
    onSuccess: () => {
      clear()
      refresh()
    },
  })

  const openIndex = openId ? assets.findIndex((a) => a.id === openId) : -1
  const open = openIndex >= 0 ? assets[openIndex] : null

  const step = useCallback(
    (delta: number) => {
      const next = assets[openIndex + delta]
      if (next) showPhoto(next.id)
    },
    [assets, openIndex, showPhoto],
  )

  if (isPending) return <TimelineSkeleton title={title} />

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h1 className="heading-display text-2xl md:text-[28px]">{title}</h1>
        {assets.length > 0 && (
          <span className="label-micro">
            {assets.length}
            {hasNextPage ? '+' : ''} {assets.length === 1 ? 'photo' : 'photos'}
          </span>
        )}
      </div>

      {assets.length === 0 ? (
        <EmptyState headline={empty.headline} body={empty.body} action={empty.action} />
      ) : (
        <PhotoGrid
          assets={assets}
          selected={selected}
          onOpen={(asset) => openPhoto(asset.id)}
          onToggleSelect={(asset, shiftKey) => toggle(asset.id, shiftKey)}
          onReachEnd={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
          }}
          loadingMore={isFetchingNextPage}
        />
      )}

      {selected.size > 0 && (
        <SelectionBar
          count={selected.size}
          onClear={clear}
          onSelectAll={selectAll}
          actions={
            mode === 'trash'
              ? [
                  {
                    label: 'Restore',
                    onClick: () => restore.mutate([...selected]),
                    icon: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
                  },
                ]
              : [
                  {
                    label: 'Add to album',
                    onClick: () => setPickingAlbum(true),
                    icon: 'M4 7h6l2 2h8v10H4zM12 12v5M9.5 14.5h5',
                  },
                  {
                    label: 'Move to vault',
                    onClick: () => toVault.mutate([...selected]),
                    icon: 'M4 11h16v9H4zM8 11V7a4 4 0 0 1 8 0v4',
                  },
                  {
                    label: 'Move to trash',
                    onClick: () => setConfirmingTrash([...selected]),
                    icon: 'M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12',
                  },
                ]
          }
        />
      )}

      {confirmingTrash && (
        <ConfirmDialog
          title={
            confirmingTrash.length === 1
              ? 'Move this photo to the trash?'
              : `Move ${confirmingTrash.length} photos to the trash?`
          }
          body={
            confirmingTrash.length === 1
              ? 'It leaves the timeline and every album. You can put it back from the trash until it is swept.'
              : 'They leave the timeline and every album. You can put them back from the trash until it is swept.'
          }
          confirmLabel="Move to trash"
          destructive
          onConfirm={() => {
            const ids = confirmingTrash
            setConfirmingTrash(null)
            closePhoto()
            trash.mutate(ids)
          }}
          onCancel={() => setConfirmingTrash(null)}
        />
      )}

      {pickingAlbum && (
        <AlbumPicker
          assetIds={[...selected]}
          onClose={() => setPickingAlbum(false)}
          onDone={(message) => {
            setPickingAlbum(false)
            clear()
            setNotice(message)
          }}
        />
      )}

      {notice && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+4.5rem))] md:pb-6">
          <p className="surface-panel rounded-full px-4 py-2 text-sm">{notice}</p>
        </div>
      )}

      {open && (
        <Viewer
          asset={open}
          hasPrevious={openIndex > 0}
          hasNext={openIndex < assets.length - 1}
          onClose={() => closePhoto()}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onToggleFavorite={(asset) => favourite.mutate(asset)}
          onTrash={(asset) => {
            closePhoto()
            trash.mutate([asset.id])
          }}
        />
      )}
    </>
  )
}

/** Mirrors the real grid's rhythm, so nothing jumps when the photos arrive. */
function TimelineSkeleton({ title }: { title: string }) {
  return (
    <>
      <h1 className="heading-display mb-5 text-2xl md:text-[28px]">{title}</h1>
      {/* biome-ignore-start lint/suspicious/noArrayIndexKey: a fixed skeleton never reorders */}
      <div className="space-y-1">
        {[3, 4, 3, 5].map((count, row) => (
          <div key={`row-${row}-${count}`} className="flex gap-1" style={{ height: 200 }}>
            {Array.from({ length: count }, (_, i) => (
              <div
                key={`cell-${row}-${i}`}
                className="animate-pulse rounded-[--radius-tile] bg-sunken"
                style={{ flex: `${1 + ((i * 7) % 5) / 10} 1 0` }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* biome-ignore-end lint/suspicious/noArrayIndexKey: a fixed skeleton never reorders */}
    </>
  )
}
