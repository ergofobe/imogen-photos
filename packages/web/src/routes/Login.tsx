import type { AuthConfig } from '@imogen/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Wordmark } from '../components/Wordmark.tsx'
import { imogen } from '../lib/client.ts'

/**
 * The first screen anyone sees. On a fresh server it is a setup screen, not a sign-in
 * screen, because there is nothing yet to sign in to — and the copy says so plainly.
 */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const navigate = useNavigate()
  const { data: config } = useQuery<AuthConfig>({
    queryKey: ['auth-config'],
    queryFn: () => imogen.auth.config(),
  })

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const params = new URLSearchParams(window.location.search)
  const returnTo = params.get('returnTo') ?? '/'
  const ssoError = params.get('error')
  /** An invitation is a way in on its own, whatever public sign-up is set to. */
  const invite = params.get('invite')

  const setup = config?.needsSetup ?? false
  const canSignUp = setup || Boolean(invite) || (config?.allowSignup ?? false)
  const [creating, setCreating] = useState(false)
  const isCreating = setup || Boolean(invite) || creating

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isCreating) {
        await imogen.auth.signup({ email, password, name, ...(invite ? { invite } : {}) })
      } else await imogen.auth.login({ email, password })

      onSignedIn()
      /*
       * `replace`, so signing in does not leave /login sitting in the history. A full
       * page load here is what made the back gesture from a photo land on the sign-in
       * screen instead of the gallery.
       *
       * An OAuth consent URL is not a client route, so that one still needs a real
       * navigation.
       */
      if (returnTo.startsWith('/oauth/')) window.location.replace(returnTo)
      else navigate(returnTo.startsWith('/') ? returnTo : '/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-[22rem]">
        <div className="mb-9">
          <Wordmark />
        </div>

        <h1 className="heading-display mb-2 text-2xl">
          {setup ? 'Set up imogen' : isCreating ? 'Create an account' : 'Sign in'}
        </h1>
        <p className="mb-7 text-sm leading-relaxed text-muted">
          {setup
            ? 'This server has no accounts yet. The first one you create becomes the administrator.'
            : 'Your photo library, on your own server.'}
        </p>

        {ssoError && (
          <p className="mb-5 rounded-lg border border-line bg-sunken px-3 py-2.5 text-sm">
            {ssoError}
          </p>
        )}

        <form onSubmit={submit} className="space-y-3.5">
          {isCreating && (
            <Field
              label="Name"
              value={name}
              onChange={setName}
              type="text"
              autoComplete="name"
              required
            />
          )}
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={isCreating ? 'new-password' : 'current-password'}
            required
            hint={isCreating ? 'At least 10 characters.' : undefined}
          />

          {error && <p className="text-sm text-safelight">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? 'Working'
              : setup
                ? 'Create administrator'
                : isCreating
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </form>

        {config?.oidc.enabled && (
          <>
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="label-micro">or</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            <a
              href={`${config.oidc.startUrl}?returnTo=${encodeURIComponent(returnTo)}`}
              className="block w-full rounded-lg border border-line py-2.5 text-center text-sm font-medium transition hover:bg-sunken"
            >
              {config.oidc.label}
            </a>
          </>
        )}

        {!setup && canSignUp && (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="mt-6 w-full text-center text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {creating ? 'Sign in instead' : 'Create an account'}
          </button>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  required,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type: string
  autoComplete: string
  required?: boolean
  hint?: string
}) {
  return (
    <label className="block">
      <span className="label-micro mb-1.5 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-safelight"
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  )
}
