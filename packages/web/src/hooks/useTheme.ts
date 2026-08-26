import { useCallback, useEffect, useState } from 'react'

const KEY = 'imogen:theme'

export type ThemeChoice = 'light' | 'dark' | 'system'

function readChoice(): ThemeChoice {
  const stored = localStorage.getItem(KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

function prefersDark(): boolean {
  return matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Three states, not two. "System" is the default and is a real choice a person can
 * return to — a two-way toggle silently pins you to whatever you last tapped, which is
 * wrong for anyone whose device switches at sunset.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)

  const resolved: 'light' | 'dark' =
    choice === 'system' ? (prefersDark() ? 'dark' : 'light') : choice

  useEffect(() => {
    const apply = () => {
      const dark = choice === 'system' ? prefersDark() : choice === 'dark'
      document.documentElement.classList.toggle('dark', dark)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#101113' : '#fbfaf7')
    }
    apply()

    // Only while following the system does a change of system preference matter.
    if (choice !== 'system') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])

  const setTheme = useCallback((next: ThemeChoice) => {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
    setChoice(next)
  }, [])

  return { choice, resolved, setTheme }
}
