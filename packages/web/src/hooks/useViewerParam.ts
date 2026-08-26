import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * The open photo lives in the URL rather than in component state.
 *
 * State would be simpler, but on a phone the back gesture pops a history entry, and if
 * opening a photo never pushed one, back leaves the page entirely — which is how
 * "swipe back from a photo" ended up at the sign-in screen instead of the gallery.
 *
 * Putting it in the URL also makes an open photo something you can reload, bookmark, or
 * send to someone.
 */
export function useViewerParam() {
  const [params, setParams] = useSearchParams()
  const openId = params.get('photo')

  const open = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params)
      next.set('photo', id)
      // A push, so the back gesture closes the photo rather than leaving the gallery.
      setParams(next)
    },
    [params, setParams],
  )

  /** Moving between photos replaces, so back closes the viewer instead of walking it. */
  const replace = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params)
      next.set('photo', id)
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const close = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('photo')
    setParams(next, { replace: true })
  }, [params, setParams])

  return { openId, open, replace, close }
}
