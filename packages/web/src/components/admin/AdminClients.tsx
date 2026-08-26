import type { AdminClient, AdminSession } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { imogen } from '../../lib/client.ts'

/**
 * What is connected, and the means to disconnect it.
 *
 * Dynamic registration is open, so applications arrive without anybody approving
 * them. That is what makes an OAuth server usable by third-party apps, and it is also
 * why being able to look at the list and end things matters.
 */
export function AdminClients() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })

  const { data: clients } = useQuery({
    queryKey: ['admin', 'clients'],
    queryFn: () => imogen.admin.clients(),
  })
  const { data: sessions } = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => imogen.admin.sessions(),
  })

  return (
    <div className="space-y-10">
      <section>
        <header className="mb-4">
          <h2 className="heading-display text-xl">Applications</h2>
          <p className="mt-1 text-sm text-muted">
            Anything that has been given permission to reach this library through the API.
          </p>
        </header>

        {clients?.length === 0 ? (
          <Empty>Nothing has connected yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {clients?.map((client) => (
              <ClientRow key={client.id} client={client} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <header className="mb-4">
          <h2 className="heading-display text-xl">Signed in</h2>
          <p className="mt-1 text-sm text-muted">
            Browsers with a live session. Ending one signs that browser out immediately.
          </p>
        </header>

        {sessions?.length === 0 ? (
          <Empty>Nobody is signed in.</Empty>
        ) : (
          <ul className="space-y-2">
            {sessions?.map((session) => (
              <SessionRow key={session.id} session={session} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ClientRow({ client, onChanged }: { client: AdminClient; onChanged: () => void }) {
  const revoke = useMutation({
    mutationFn: () => imogen.admin.revokeClient(client.id),
    onSuccess: onChanged,
  })

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{client.name}</p>
          <p className="truncate font-mono text-[13px] text-muted">{client.id}</p>
        </div>
        <span className="label-micro rounded-full border border-line px-2 py-0.5">
          {client.dynamicallyRegistered ? 'Registered itself' : 'Set up here'}
        </span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <Fact label="Live tokens" value={client.activeTokens.toLocaleString()} />
        <Fact label="Kind" value={client.isPublic ? 'Public (PKCE)' : 'Holds a secret'} />
        <Fact label="Added" value={new Date(client.createdAt).toLocaleDateString()} />
      </dl>

      {client.scopes.length > 0 && (
        <p className="mt-2 font-mono text-[12px] text-muted">{client.scopes.join(' · ')}</p>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => revoke.mutate()}
          disabled={revoke.isPending}
          className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken disabled:opacity-50"
        >
          {revoke.isPending ? 'Revoking' : 'Revoke'}
        </button>
        {revoke.isError && (
          <span className="ml-2 text-sm text-red-500">
            {revoke.error instanceof Error ? revoke.error.message : 'That did not work'}
          </span>
        )}
      </div>
    </li>
  )
}

function SessionRow({ session, onChanged }: { session: AdminSession; onChanged: () => void }) {
  const revoke = useMutation({
    mutationFn: () => imogen.admin.revokeSession(session.id),
    onSuccess: onChanged,
  })

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {session.userEmail}
          {session.current && <span className="ml-2 text-muted">· this browser</span>}
        </p>
        <p className="label-micro truncate text-[10px] text-muted">
          {describe(session.userAgent)}
          {session.ipAddress ? ` · ${session.ipAddress}` : ''} · last used{' '}
          {new Date(session.lastUsedAt).toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onClick={() => revoke.mutate()}
        disabled={revoke.isPending || session.current}
        title={session.current ? 'Sign out from Settings instead' : undefined}
        className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken disabled:opacity-40"
      >
        End
      </button>
    </li>
  )
}

/** A user agent string is not for reading. This gets it down to the useful part. */
function describe(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser'
  const browser = /Firefox\/[\d.]+/.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Unknown browser'
  const platform = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return platform ? `${browser} on ${platform}` : browser
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-micro text-[10px] text-muted">{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="text-sm text-muted">{children}</p>
    </div>
  )
}
