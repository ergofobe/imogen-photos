import type { ShareLink } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { imogen } from '../lib/client.ts'

type Target = { kind: 'album'; id: string } | { kind: 'photo'; id: string }

/**
 * Publishing something, and taking it back.
 *
 * The same panel serves an album and a single photograph because the decisions are
 * identical — who can reach it, whether they can download, when it stops working —
 * and having two of these would mean two places to get those wrong.
 *
 * A live link is stated plainly as public. It is a URL anybody can open, and the
 * interface should not be coy about what has been handed out.
 */
export function SharePanel({ target, onClose }: { target: Target; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [allowDownload, setAllowDownload] = useState(true)
  const [expiresInDays, setExpiresInDays] = useState('')
  const [copied, setCopied] = useState(false)

  const key = ['share', target.kind, target.id]
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: ['albums'] })
    void queryClient.invalidateQueries({ queryKey: ['album'] })
  }

  const { data: link, isPending } = useQuery({
    queryKey: key,
    queryFn: () =>
      target.kind === 'photo'
        ? imogen.assets.shareLink(target.id)
        : imogen.albums.shareLink(target.id),
  })

  const create = useMutation({
    mutationFn: () => {
      const input = {
        allowDownload,
        ...(password.trim() ? { password: password.trim() } : {}),
        ...(expiresInDays
          ? {
              expiresAt: new Date(
                Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000,
              ).toISOString(),
            }
          : {}),
      }
      return target.kind === 'photo'
        ? imogen.assets.share(target.id, input)
        : imogen.albums.share(target.id, input)
    },
    onSuccess: refresh,
  })

  const revoke = useMutation({
    mutationFn: () =>
      target.kind === 'photo' ? imogen.assets.unshare(target.id) : imogen.albums.unshare(target.id),
    onSuccess: () => {
      setPassword('')
      refresh()
    },
  })

  const noun = target.kind === 'photo' ? 'photo' : 'album'

  return (
    <div className="surface-panel rounded-xl p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="heading-display text-base">Share this {noun}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Close
        </button>
      </div>

      {isPending ? (
        <div className="h-20 animate-pulse rounded-lg bg-sunken" />
      ) : link ? (
        <LiveLink
          link={link}
          noun={noun}
          copied={copied}
          onCopy={() => {
            void navigator.clipboard.writeText(link.url)
            setCopied(true)
          }}
          onRevoke={() => revoke.mutate()}
          revoking={revoke.isPending}
        />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
          className="space-y-3"
        >
          <p className="text-sm leading-relaxed text-muted">
            Anyone with the link will be able to see this {noun}. They will not need an account.
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(event) => setAllowDownload(event.target.checked)}
              className="accent-safelight"
            />
            They can download the full-size {target.kind === 'photo' ? 'file' : 'files'}
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password (optional)"
              className="min-w-44 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-safelight"
            />
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              placeholder="Days"
              className="w-20 rounded-lg border border-line bg-paper px-3 py-1.5 text-center font-mono text-[13px] outline-none focus:border-safelight"
              title="Stop working after this many days"
            />
          </div>

          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? 'Making a link' : 'Create a link'}
          </button>

          {create.isError && (
            <p className="text-sm text-red-500">
              {create.error instanceof Error ? create.error.message : 'That did not work'}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

function LiveLink({
  link,
  noun,
  copied,
  onCopy,
  onRevoke,
  revoking,
}: {
  link: ShareLink
  noun: string
  copied: boolean
  onCopy: () => void
  onRevoke: () => void
  revoking: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">
        This {noun} is public. Anyone with the link can open it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[13px]">
          {link.url}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper transition hover:opacity-90"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="text-sm text-muted">
        {link.allowDownload ? 'Downloads are on.' : 'Downloads are off.'}
        {link.expiresAt
          ? ` Stops working ${new Date(link.expiresAt).toLocaleDateString()}.`
          : ' It does not expire on its own.'}
      </p>

      <button
        type="button"
        onClick={onRevoke}
        disabled={revoking}
        className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken disabled:opacity-50"
      >
        {revoking ? 'Stopping' : 'Stop sharing'}
      </button>
    </div>
  )
}
