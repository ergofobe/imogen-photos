import { useCallback, useEffect, useState } from 'react'

const KEY = 'imogen:theme'

/** Follows the system by default; an explicit choice sticks. */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute('content', dark ? '#101113' : '#fbfaf7')
  }, [dark])

  const toggle = useCallback(() => {
    setDark((current) => {
      localStorage.setItem(KEY, current ? 'light' : 'dark')
      return !current
    })
  }, [])

  return { dark, toggle }
}
