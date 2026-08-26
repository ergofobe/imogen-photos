import type { User } from '@imogen/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ProfileForm } from '../components/ProfileForm.tsx'
import { signOut } from '../components/Shell.tsx'
import { imogen } from '../lib/client.ts'
import { formatBytes } from '../lib/format.ts'

export function Settings({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => imogen.assets.stats(),
  })

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)
    try {
      await imogen.auth.changePassword({ currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setMessage('Password changed. Other devices have been signed out.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not change the password')
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="heading-display mb-6 text-2xl md:text-[28px]">Settings</h1>

      <Section title="Account">
        <ProfileForm
          user={user}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
        />
        {user.oidcSubject && (
          <div className="pt-3">
            <Row label="Sign-in" value="Single sign-on" />
          </div>
        )}
      </Section>

      {user.hasPassword && (
        <Section title="Password">
          <form onSubmit={changePassword} className="space-y-3 pt-1">
            <label className="block">
              <span className="label-micro mb-1.5 block">Current password</span>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-safelight"
              />
            </label>
            <label className="block">
              <span className="label-micro mb-1.5 block">New password</span>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={10}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-safelight"
              />
            </label>
            {message && <p className="text-sm text-muted">{message}</p>}
            <button
              type="submit"
              className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:opacity-90"
            >
              Change password
            </button>
          </form>
        </Section>
      )}

      {stats && (
        <Section title="Library">
          <Row label="Photos" value={String(stats.imageCount)} />
          <Row label="Videos" value={String(stats.videoCount)} />
          <Row label="Albums" value={String(stats.albumCount)} />
          <Row label="In trash" value={String(stats.trashedCount)} />
          <Row label="Storage" value={formatBytes(stats.storageBytes)} />
        </Section>
      )}

      <Section title="Developers">
        <p className="pt-1 text-sm leading-relaxed text-muted">
          imogen has a documented REST API, a TypeScript SDK, and an MCP endpoint your AI assistants
          can connect to.
        </p>
        <div className="flex flex-wrap gap-2 pt-3">
          <a
            href="/api/v1/docs"
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            API reference
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(`${window.location.origin}/mcp`)
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            Copy MCP URL
          </button>
        </div>
      </Section>

      {user.role === 'admin' && (
        <Section title="Administration">
          <p className="pt-1 text-sm leading-relaxed text-muted">
            You look after this server. Accounts, the processing queue, connected apps and
            everything shared publicly are managed separately from your own library.
          </p>
          <div className="flex flex-wrap gap-2 pt-3">
            <Link
              to="/admin"
              className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
            >
              Open administration
            </Link>
          </div>
        </Section>
      )}

      <div className="mt-8 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="label-micro mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-[13px] tabular-nums">{value}</span>
    </div>
  )
}
