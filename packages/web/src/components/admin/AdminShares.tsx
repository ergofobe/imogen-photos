import type { AdminShareLink } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { imogen } from '../../lib/client.ts'

/**
 * Everything a stranger can reach right now.
 *
 * Revoked and expired links are left out. This page answers one question — what is
 * public at this moment — and padding it with dead links makes that harder to see.
 */
export function AdminShares() {
  const queryClient = useQueryClient()
  const { data: shares, isPending } = useQuery({
    queryKey: ['admin', 'shares'],
    queryFn: () => imogen.admin.shares(),
  })

  const revoke = useMutation({
    mutationFn: (id: string) => imogen.admin.revokeShare(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'shares'] }),
  })

  if (isPending) return <div className="h-40 animate-pulse rounded-xl bg-sunken" />

  return (
    <section>
      <header className="mb-4">
        <h2 className="heading-display text-xl">Share links</h2>
        <p className="mt-1 text-sm text-muted">
          {shares?.length === 0
            ? 'Nothing on this server is public.'
            : `${shares?.length} ${shares?.length === 1 ? 'link is' : 'links are'} live. Anyone holding one can open it without an account.`}
        </p>
      </header>

      {shares?.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-muted">Nothing has been shared.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {shares?.map((share) => (
            <ShareRow
              key={share.id}
              share={share}
              onRevoke={() => revoke.mutate(share.id)}
              busy={revoke.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ShareRow({
  share,
  onRevoke,
  busy,
}: {
  share: AdminShareLink
  onRevoke: () => void
  busy: boolean
}) {
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{share.target}</p>
          <p className="truncate text-[13px] text-muted">
            {share.kind === 'album' ? 'An album' : 'One photo'} · shared by {share.createdByEmail}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {share.hasPassword && (
            <span className="label-micro rounded-full border border-line px-2 py-0.5">
              Password
            </span>
          )}
          {share.allowDownload && (
            <span className="label-micro rounded-full border border-line px-2 py-0.5">
              Downloads
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 truncate font-mono text-[12px] text-muted">{share.url}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={onRevoke}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken disabled:opacity-50"
        >
          Close this link
        </button>
        <span className="label-micro text-[10px] text-muted">
          Made {new Date(share.createdAt).toLocaleDateString()}
          {share.expiresAt
            ? ` · runs out ${new Date(share.expiresAt).toLocaleDateString()}`
            : ' · no expiry'}
        </span>
      </div>
    </li>
  )
}
