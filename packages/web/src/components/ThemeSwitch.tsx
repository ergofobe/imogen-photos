import { type ThemeChoice, useTheme } from '../hooks/useTheme.ts'

const OPTIONS: Array<{ value: ThemeChoice; label: string; icon: string }> = [
  {
    value: 'system',
    label: 'System',
    icon: 'M4 5h16v10H4zM9 19h6M12 15v4',
  },
  {
    value: 'light',
    label: 'Light',
    icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.4 6.4-.7-.7M6.3 6.3l-.7-.7m12.8 0-.7.7M6.3 17.7l-.7.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  },
  { value: 'dark', label: 'Dark', icon: 'M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5' },
]

/**
 * Three states rather than a toggle, because "follow my system" is a position someone
 * needs to be able to return to, not just the state they happened to start in.
 */
export function ThemeSwitch() {
  const { choice, setTheme } = useTheme()

  return (
    <fieldset className="flex items-center gap-0.5 rounded-lg bg-sunken p-0.5">
      <legend className="sr-only">Appearance</legend>
      {OPTIONS.map((option) => {
        const active = choice === option.value
        return (
          <label
            key={option.value}
            title={option.label}
            className={`flex flex-1 cursor-pointer items-center justify-center rounded-md py-1.5 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-safelight ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name="appearance"
              value={option.value}
              checked={active}
              onChange={() => setTheme(option.value)}
              className="sr-only"
            />
            <span className="sr-only">{option.label}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d={option.icon} />
            </svg>
          </label>
        )
      })}
    </fieldset>
  )
}
