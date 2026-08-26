/*
 * Runs before first paint so a dark-mode user never sees a white flash. It lives in its
 * own file rather than inline in the document because the server sends a strict
 * script-src 'self' policy, and an inline script would be blocked by it.
 *
 * No stored value means "follow the system", which is the default.
 */
;(() => {
  try {
    const stored = localStorage.getItem('imogen:theme')
    const dark =
      stored === 'dark' ||
      (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  } catch {
    /* Private browsing can refuse localStorage; the default theme is fine. */
  }
})()
