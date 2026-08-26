import type { Asset, AssetQuery } from '@imogen/shared'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState.tsx'
import { PhotoGrid } from '../components/PhotoGrid.tsx'
import { SelectionBar } from '../components/SelectionBar.tsx'
import { Viewer } from '../components/Viewer.tsx'
import { useSelection } from '../hooks/useSelection.ts'
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
  const [openId, setOpenId] = useState<string | null>(null)

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
      if (next) setOpenId(next.id)
    },
    [assets, openIndex],
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
          onOpen={(asset) => setOpenId(asset.id)}
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
                    label: 'Move to trash',
                    onClick: () => trash.mutate([...selected]),
                    icon: 'M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12',
                  },
                ]
          }
        />
      )}

      {open && (
        <Viewer
          asset={open}
          hasPrevious={openIndex > 0}
          hasNext={openIndex < assets.length - 1}
          onClose={() => setOpenId(null)}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onToggleFavorite={(asset) => favourite.mutate(asset)}
          onTrash={(asset) => {
            setOpenId(null)
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
