import type { AdminUser } from '@imogen/shared'
import { useQuery } from '@tanstack/react-query'
import { imogen } from '../../lib/client.ts'
import { formatBytes } from '../../lib/format.ts'

/**
 * Everyone with an account on this server.
 *
 * The columns are chosen for the decisions an administrator actually makes: how much
 * of the disk someone is using, and whether they have a password that could be reset
 * or sign in only through the identity provider.
 */
export function AdminAccounts() {
  const { data: users, isPending } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => imogen.admin.users(),
  })

  if (isPending) {
    return <div className="h-40 animate-pulse rounded-xl bg-sunken" />
  }

  return (
    <section>
      <header className="mb-4">
        <h2 className="heading-display text-xl">Accounts</h2>
        <p className="mt-1 text-sm text-muted">
          {users?.length === 1 ? 'One account' : `${users?.length ?? 0} accounts`} on this server.
        </p>
      </header>

      <ul className="space-y-2">
        {users?.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </ul>
    </section>
  )
}

function AccountRow({ account }: { account: AdminUser }) {
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate font-mono text-[13px] text-muted">{account.email}</p>
        </div>
        {account.role === 'admin' && (
          <span className="label-micro rounded-full border border-line px-2 py-0.5">
            Administrator
          </span>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
        <Fact label="Photos" value={account.photoCount.toLocaleString()} />
        <Fact
          label="Using"
          value={
            account.quotaBytes
              ? `${formatBytes(account.usedBytes)} of ${formatBytes(account.quotaBytes)}`
              : formatBytes(account.usedBytes)
          }
        />
        <Fact label="Signs in with" value={SIGN_IN[account.signsInWith]} />
      </dl>
    </li>
  )
}

const SIGN_IN: Record<AdminUser['signsInWith'], string> = {
  password: 'A password',
  sso: 'Single sign-on',
  both: 'Password or SSO',
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-micro text-[10px] text-muted">{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums">{value}</dd>
    </div>
  )
}
