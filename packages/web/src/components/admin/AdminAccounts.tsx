import type { AdminUser, Invite, InviteCreated } from '@imogen/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { imogen } from '../../lib/client.ts'
import { formatBytes } from '../../lib/format.ts'

/**
 * Everyone with an account on this server, and the ways in.
 *
 * The columns are the decisions an administrator actually makes: how much of the disk
 * someone is using, and whether they have a password that could be reset or sign in
 * only through the identity provider.
 */
export function AdminAccounts() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })

  const { data: users, isPending } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => imogen.admin.users(),
  })
  const { data: invites } = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => imogen.admin.invites(),
  })

  const adminCount = users?.filter((u) => u.role === 'admin').length ?? 0

  return (
    <div className="space-y-10">
      <section>
        <header className="mb-4">
          <h2 className="heading-display text-xl">Accounts</h2>
          <p className="mt-1 text-sm text-muted">
            {users?.length === 1 ? 'One account' : `${users?.length ?? 0} accounts`} on this server.
          </p>
        </header>

        {isPending ? (
          <div className="h-40 animate-pulse rounded-xl bg-sunken" />
        ) : (
          <ul className="space-y-2">
            {users?.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                isOnlyAdmin={account.role === 'admin' && adminCount === 1}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
      </section>

      <Invitations invites={invites ?? []} onChanged={refresh} />
    </div>
  )
}

function AccountRow({
  account,
  isOnlyAdmin,
  onChanged,
}: {
  account: AdminUser
  isOnlyAdmin: boolean
  onChanged: () => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [resetting, setResetting] = useState(false)

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof imogen.admin.updateUser>[1]) =>
      imogen.admin.updateUser(account.id, patch),
    onSuccess: onChanged,
  })
  const remove = useMutation({
    mutationFn: () => imogen.admin.deleteUser(account.id),
    onSuccess: onChanged,
  })

  const busy = update.isPending || remove.isPending

  return (
    <li
      className={`rounded-xl border p-4 ${account.disabled ? 'border-line bg-sunken/50' : 'border-line'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate font-mono text-[13px] text-muted">{account.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {account.disabled && (
            <span className="label-micro rounded-full border border-red-500/40 px-2 py-0.5 text-red-500">
              Suspended
            </span>
          )}
          {account.role === 'admin' && (
            <span className="label-micro rounded-full border border-line px-2 py-0.5">
              Administrator
            </span>
          )}
        </div>
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

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Action
          disabled={busy || isOnlyAdmin}
          title={isOnlyAdmin ? 'The only administrator cannot step down' : undefined}
          onClick={() => update.mutate({ role: account.role === 'admin' ? 'user' : 'admin' })}
        >
          {account.role === 'admin' ? 'Remove administrator' : 'Make administrator'}
        </Action>

        <Action
          disabled={busy || (isOnlyAdmin && !account.disabled)}
          title={
            isOnlyAdmin && !account.disabled
              ? 'The only administrator cannot be suspended'
              : undefined
          }
          onClick={() => update.mutate({ disabled: !account.disabled })}
        >
          {account.disabled ? 'Restore access' : 'Suspend'}
        </Action>

        {account.signsInWith !== 'sso' && (
          <Action disabled={busy} onClick={() => setResetting(true)}>
            Set a password
          </Action>
        )}

        {confirmingDelete ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">
              Delete {account.name}? Their photos go to the trash.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate()}
              className="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              Delete
            </button>
            <Action disabled={busy} onClick={() => setConfirmingDelete(false)}>
              Keep
            </Action>
          </span>
        ) : (
          <Action
            disabled={busy || isOnlyAdmin}
            title={isOnlyAdmin ? 'The only administrator cannot be deleted' : undefined}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Action>
        )}

        {(update.isError || remove.isError) && (
          <span className="text-sm text-red-500">{errorText(update.error ?? remove.error)}</span>
        )}
      </div>

      {resetting && (
        <PasswordReset
          account={account}
          onClose={() => setResetting(false)}
          onDone={() => {
            setResetting(false)
            onChanged()
          }}
        />
      )}
    </li>
  )
}

function PasswordReset({
  account,
  onClose,
  onDone,
}: {
  account: AdminUser
  onClose: () => void
  onDone: () => void
}) {
  const [password, setPassword] = useState('')

  const save = useMutation({
    mutationFn: () => imogen.admin.resetPassword(account.id, password),
    onSuccess: onDone,
  })

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (password.length >= 10) save.mutate()
      }}
      className="mt-3 rounded-lg border border-line bg-sunken p-3"
    >
      <p className="mb-2 text-sm text-muted">
        Set a password for {account.name} and pass it on yourself. Every session they have open will
        end.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={(node) => node?.focus()}
          type="text"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 10 characters"
          className="min-w-56 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[13px] outline-none focus:border-safelight"
        />
        <button
          type="submit"
          disabled={password.length < 10 || save.isPending}
          className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? 'Setting' : 'Set password'}
        </button>
        <Action onClick={onClose}>Cancel</Action>
      </div>
      {save.isError && <p className="mt-2 text-sm text-red-500">{errorText(save.error)}</p>}
    </form>
  )
}

/**
 * Invitations, and the one moment their link is legible.
 *
 * The token is shown until it is dismissed rather than in a toast that disappears:
 * it cannot be recovered afterwards, and losing it means revoking and starting again.
 */
function Invitations({ invites, onChanged }: { invites: Invite[]; onChanged: () => void }) {
  const [justMade, setJustMade] = useState<InviteCreated | null>(null)
  const [asAdmin, setAsAdmin] = useState(false)
  const [email, setEmail] = useState('')

  const create = useMutation({
    mutationFn: () =>
      imogen.admin.createInvite({
        role: asAdmin ? 'admin' : 'user',
        ...(email.trim() ? { email: email.trim() } : {}),
      }),
    onSuccess: (invite) => {
      setJustMade(invite)
      setEmail('')
      setAsAdmin(false)
      onChanged()
    },
  })

  const revoke = useMutation({
    mutationFn: (id: string) => imogen.admin.revokeInvite(id),
    onSuccess: onChanged,
  })

  const pending = invites.filter((invite) => invite.state === 'pending')

  return (
    <section>
      <header className="mb-4">
        <h2 className="heading-display text-xl">Invitations</h2>
        <p className="mt-1 text-sm text-muted">
          A link that opens one account. Send it however you like — this server has no mail of its
          own.
        </p>
      </header>

      {justMade && <InviteLink invite={justMade} onDismiss={() => setJustMade(null)} />}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
        className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line p-4"
      >
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Their email (optional)"
          className="min-w-56 flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-safelight"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={asAdmin}
            onChange={(event) => setAsAdmin(event.target.checked)}
            className="accent-safelight"
          />
          As an administrator
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? 'Making' : 'Make an invitation'}
        </button>
      </form>

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {invite.email ?? 'Anyone with the link'}
                  {invite.role === 'admin' && ' · administrator'}
                </p>
                <p className="label-micro text-[10px] text-muted">
                  Runs out {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <Action disabled={revoke.isPending} onClick={() => revoke.mutate(invite.id)}>
                Revoke
              </Action>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function InviteLink({ invite, onDismiss }: { invite: InviteCreated; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/login?invite=${encodeURIComponent(invite.token)}`

  return (
    <div className="mb-4 rounded-xl border border-safelight/50 bg-safelight/5 p-4">
      <p className="mb-2 text-sm">
        Here is the link. This is the only time it can be read — it is stored as a hash, so if it is
        lost, revoke it and make another.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[13px]">
          {url}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url)
            setCopied(true)
          }}
          className="rounded-lg bg-ink px-3 py-1.5 text-sm text-paper transition hover:opacity-90"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <Action onClick={onDismiss}>Done</Action>
      </div>
    </div>
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

function Action({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'That did not work'
}
