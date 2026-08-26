import type { User } from '@imogen/shared'
import { NavLink, useNavigate } from 'react-router'
import { useTheme } from '../hooks/useTheme.ts'
import { imogen } from '../lib/client.ts'
import { Wordmark } from './Wordmark.tsx'

type Props = { user: User; children: React.ReactNode; onUpload: () => void }

const NAV = [
  { to: '/', label: 'Photos', icon: 'M4 6h16v12H4zM4 15l4.5-4.5L13 15l3-3 4 4' },
  {
    to: '/favourites',
    label: 'Favourites',
    icon: 'M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z',
  },
  { to: '/albums', label: 'Albums', icon: 'M4 8h7l2 2h7v9H4zM7 8V5h6v3' },
  { to: '/trash', label: 'Trash', icon: 'M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12' },
]

export function Shell({ user, children, onUpload }: Props) {
  const navigate = useNavigate()
  const { dark, toggle } = useTheme()

  return (
    <div className="min-h-dvh">
      {/* Desktop: a quiet rail. Mobile: a bottom bar. Same links, same order, same names. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-paper px-3 py-5 md:flex">
        <div className="mb-7 px-2">
          <Wordmark />
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-sunken font-medium text-ink'
                    : 'text-muted hover:bg-sunken/60 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* The safelight marks where you are. It is the only chroma in the chrome. */}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 h-4 w-[3px] rounded-r-full bg-safelight transition-opacity"
                    style={{ opacity: isActive ? 1 : 0 }}
                  />
                  <Icon path={item.icon} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={onUpload}
          className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2.5 text-sm font-medium text-paper transition hover:opacity-90"
        >
          <Icon path="M12 5v14M5 12h14" />
          Add photos
        </button>

        <div className="mt-auto space-y-1 pt-5">
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-sunken/60 hover:text-ink"
          >
            <Icon
              path={
                dark
                  ? 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4-.7-.7M6.3 6.3l-.7-.7m12.8 0-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'
                  : 'M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5'
              }
            />
            {dark ? 'Light' : 'Dark'}
          </button>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive ? 'bg-sunken text-ink' : 'text-muted hover:bg-sunken/60 hover:text-ink'
              }`
            }
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-semibold text-paper">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{user.name}</span>
          </NavLink>
        </div>
      </aside>

      <main className="px-4 pb-24 pt-4 md:ml-60 md:px-8 md:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition ${
                isActive ? 'text-ink' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className="h-[2px] w-6 rounded-full bg-safelight transition-opacity"
                  style={{ opacity: isActive ? 1 : 0 }}
                />
                <Icon path={item.icon} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onUpload}
          aria-label="Add photos"
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] text-muted"
        >
          <span aria-hidden="true" className="h-[2px] w-6" />
          <Icon path="M12 5v14M5 12h14" />
          Add
        </button>
      </nav>

      <button
        type="button"
        onClick={() => navigate('/search')}
        className="sr-only"
        aria-label="Search photos"
      />
    </div>
  )
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0"
    >
      <path d={path} />
    </svg>
  )
}

export async function signOut() {
  await imogen.auth.logout().catch(() => {})
  window.location.href = '/login'
}
