import { useQuery } from '@tanstack/react-query'
import { imogen } from '../../lib/client.ts'
import { formatBytes } from '../../lib/format.ts'

/**
 * Where the bytes are.
 *
 * Originals and derivatives are separated because they answer different questions:
 * originals are what a backup must not lose, derivatives are what can be thrown away
 * and made again.
 */
export function AdminStorage() {
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'storage'],
    queryFn: () => imogen.admin.storage(),
  })

  if (isPending || !data) return <div className="h-40 animate-pulse rounded-xl bg-sunken" />

  const biggest = Math.max(...data.perUser.map((u) => u.usedBytes), 1)

  return (
    <div className="space-y-10">
      <section>
        <header className="mb-4">
          <h2 className="heading-display text-xl">Storage</h2>
          <p className="mt-1 font-mono text-[13px] text-muted">{data.dataDir}</p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Originals" value={formatBytes(data.originalBytes)} />
          <Tile label="Thumbnails etc" value={formatBytes(data.derivativeBytes)} />
          <Tile label="In the trash" value={formatBytes(data.trashedBytes)} />
        </div>

        {data.missingFiles > 0 && (
          <p className="mt-3 rounded-lg border border-red-500/40 p-3 text-sm text-red-500">
            {data.missingFiles} rows point at a file that is not there. Something has changed the
            library from underneath.
          </p>
        )}
      </section>

      <section>
        <header className="mb-4">
          <h2 className="heading-display text-xl">Trash</h2>
          <p className="mt-1 text-sm text-muted">
            {data.trashedCount === 0
              ? 'Nothing is waiting to be destroyed.'
              : `${data.trashedCount.toLocaleString()} ${
                  data.trashedCount === 1 ? 'photo is' : 'photos are'
                } waiting out the ${data.trashRetentionDays}-day window.`}
          </p>
        </header>
        {data.nextSweepAt && (
          <p className="text-sm text-muted">
            The oldest becomes unrecoverable {new Date(data.nextSweepAt).toLocaleString()}.
          </p>
        )}
      </section>

      <section>
        <header className="mb-4">
          <h2 className="heading-display text-xl">By account</h2>
        </header>
        <ul className="space-y-2">
          {data.perUser.map((user) => (
            <li key={user.userId} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="truncate font-mono text-[13px]">{user.email}</p>
                <p className="font-mono text-[13px] tabular-nums">
                  {formatBytes(user.usedBytes)} · {user.photoCount.toLocaleString()} photos
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div
                  className="h-full rounded-full bg-safelight"
                  style={{ width: `${Math.round((user.usedBytes / biggest) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="label-micro text-[10px] text-muted">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums">{value}</p>
    </div>
  )
}
