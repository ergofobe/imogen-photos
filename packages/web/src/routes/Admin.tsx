import type { User } from '@imogen/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import { AdminAccounts } from '../components/admin/AdminAccounts.tsx'
import { AdminClients } from '../components/admin/AdminClients.tsx'
import { AdminProcessing } from '../components/admin/AdminProcessing.tsx'

type SectionId = 'accounts' | 'processing' | 'clients' | 'storage' | 'settings' | 'shares'

const SECTIONS: Array<{ id: SectionId; title: string; blurb: string }> = [
  { id: 'accounts', title: 'Accounts', blurb: 'Who can sign in' },
  { id: 'processing', title: 'Processing', blurb: 'The work queue' },
  { id: 'clients', title: 'Apps & sessions', blurb: 'What is connected' },
  { id: 'storage', title: 'Storage', blurb: 'Where the bytes are' },
  { id: 'shares', title: 'Share links', blurb: 'What is public' },
  { id: 'settings', title: 'Server', blurb: 'How it behaves' },
]

/**
 * Server administration.
 *
 * A room of its own rather than another page of the photo app: the things done here
 * act on everybody's library at once, and dressing that as one more tab beside
 * Favourites invites the kind of mistake that is hard to take back.
 *
 * The route is registered only for administrators, so for everyone else it does not
 * exist in the router at all and falls through to the same redirect as any other
 * unknown path. Nothing here is load-bearing for security — the API answers 404 to
 * non-administrators on its own — but a panel that renders "Forbidden" would announce
 * itself just as loudly as a 403 does.
 */
export function Admin({ user }: { user: User }) {
  const [active, setActive] = useState<SectionId>('accounts')

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <h1 className="heading-display text-lg">Administration</h1>
            <span className="label-micro text-muted">{user.name}</span>
          </div>
          <Link
            to="/"
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-sunken"
          >
            Back to photos
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 md:flex-row md:gap-10">
        <nav aria-label="Sections" className="md:w-52 md:shrink-0">
          <ul className="flex gap-2 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setActive(section.id)}
                  aria-current={active === section.id ? 'page' : undefined}
                  className={`w-full whitespace-nowrap rounded-lg px-3 py-2 text-left transition md:whitespace-normal ${
                    active === section.id
                      ? 'bg-sunken text-ink'
                      : 'text-muted hover:bg-sunken hover:text-ink'
                  }`}
                >
                  <span className="block text-sm">{section.title}</span>
                  <span className="label-micro hidden text-[10px] text-muted md:block">
                    {section.blurb}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">
          {active === 'accounts' && <AdminAccounts />}
          {active === 'processing' && <AdminProcessing />}
          {active === 'clients' && <AdminClients />}
          {!['accounts', 'processing', 'clients'].includes(active) && <NotBuiltYet />}
        </main>
      </div>
    </div>
  )
}

/** Honest about what is not here yet, rather than an empty pane that looks broken. */
function NotBuiltYet() {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="text-sm text-muted">This section is still being built.</p>
    </div>
  )
}
