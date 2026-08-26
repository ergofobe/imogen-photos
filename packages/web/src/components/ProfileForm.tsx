import type { AuthConfig, User } from '@imogen/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { imogen } from '../lib/client.ts'

/**
 * Editing your own name and email.
 *
 * An account linked to an identity provider gets read-only fields and a sentence saying
 * why — imogen re-reads those details at every sign-in, so letting someone type here
 * would quietly discard their edit the next time they signed in.
 */
export function ProfileForm({ user, onSaved }: { user: User; onSaved: () => void }) {
  const managed = user.oidcSubject !== null
  const { data: authConfig } = useQuery<AuthConfig>({
    queryKey: ['auth-config'],
    queryFn: () => imogen.auth.config(),
    enabled: managed,
  })
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [status, setStatus] = useState<{ kind: 'error' | 'saved'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase()
  const nameChanged = name.trim() !== user.name
  const dirty = emailChanged || nameChanged

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setStatus(null)
    setBusy(true)
    try {
      await imogen.auth.updateProfile({
        ...(nameChanged ? { name: name.trim() } : {}),
        ...(emailChanged ? { email: email.trim() } : {}),
        ...(emailChanged && user.hasPassword ? { currentPassword } : {}),
      })
      setCurrentPassword('')
      setStatus({ kind: 'saved', message: 'Saved.' })
      onSaved()
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not save your changes',
      })
    } finally {
      setBusy(false)
    }
  }

  if (managed) {
    const provider = authConfig?.oidc.enabled ? authConfig.oidc : null
    return (
      <div className="space-y-2">
        <Row label="Name" value={user.name} />
        <Row label="Email" value={user.email} />
        <p className="pt-2 text-xs leading-relaxed text-muted">
          Your name and email come from{' '}
          {provider?.label ?? 'the identity provider you sign in with'}. Change them there and
          imogen picks the change up the next time you sign in.
        </p>
        {provider?.accountUrl && (
          <a
            href={provider.accountUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            Manage your account
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" />
            </svg>
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3.5 pt-1">
      <label className="block">
        <span className="label-micro mb-1.5 block">Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          required
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-safelight"
        />
      </label>

      <label className="block">
        <span className="label-micro mb-1.5 block">Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-safelight"
        />
      </label>

      {/* Asked for only when it is actually needed, and explained where it is asked. */}
      {emailChanged && user.hasPassword && (
        <label className="block">
          <span className="label-micro mb-1.5 block">Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-safelight"
          />
          <span className="mt-1.5 block text-xs text-muted">
            Changing your email needs your password, so nobody at an unlocked screen can move your
            account somewhere you cannot reach.
          </span>
        </label>
      )}

      {status && (
        <p className={`text-sm ${status.kind === 'error' ? 'text-safelight' : 'text-muted'}`}>
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !dirty}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? 'Saving' : 'Save changes'}
      </button>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-[13px]">{value}</span>
    </div>
  )
}
