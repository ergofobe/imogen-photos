import { useCallback, useEffect, useRef, useState } from 'react'
import { PULL, pullMetrics } from './pull.ts'

type Options = {
  onRefresh: () => Promise<unknown>
  /** Turned off while a photo or a drawer is open, and on pointer devices. */
  enabled?: boolean
}

/**
 * Pull-to-refresh, implemented rather than borrowed from the browser.
 *
 * The browser's own gesture reloads the whole page, which in an installed app means
 * re-downloading the shell and losing your place — and it does not exist at all in
 * standalone mode or on iOS Safari, which is where an installed imogen actually runs.
 * This refetches the data instead and leaves the page where it was.
 */
export function usePullToRefresh({ onRefresh, enabled = true }: Options) {
  const [distance, setDistance] = useState(0)
  const [armed, setArmed] = useState(false)
  const [progress, setProgress] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const startY = useRef<number | null>(null)
  const active = useRef(false)
  /*
   * Mirrors of the state the listeners read. Depending on the state directly would
   * re-bind every listener on each touchmove — dozens of times per pull, on the device
   * least able to afford it.
   */
  const armedRef = useRef(false)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const reset = useCallback(() => {
    startY.current = null
    active.current = false
    armedRef.current = false
    setDistance(0)
    setArmed(false)
    setProgress(0)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onTouchStart = (event: TouchEvent) => {
      // Only from the very top: mid-scroll, a downward drag is a scroll.
      if (window.scrollY > 0 || refreshingRef.current) return
      const touch = event.touches[0]
      if (!touch) return
      // A photo viewer or a drawer owns its own gestures.
      if ((event.target as HTMLElement | null)?.closest('[role="dialog"]')) return
      startY.current = touch.clientY
      active.current = false
    }

    const onTouchMove = (event: TouchEvent) => {
      const start = startY.current
      const touch = event.touches[0]
      if (start === null || !touch) return

      const rawDelta = touch.clientY - start
      // Scrolling away from the top cancels: the gesture was a scroll after all.
      if (window.scrollY > 0 || rawDelta <= 0) {
        if (active.current) reset()
        return
      }

      const state = pullMetrics(rawDelta)
      // Claim the gesture only once it is clearly a pull, so a flick still scrolls.
      if (!active.current && state.distance < 8) return
      active.current = true

      // Stop the page scrolling under the gesture we have taken over.
      if (event.cancelable) event.preventDefault()

      armedRef.current = state.armed
      setDistance(state.distance)
      setArmed(state.armed)
      setProgress(state.progress)
    }

    const onTouchEnd = async () => {
      const shouldRefresh = active.current && armedRef.current
      if (!shouldRefresh) return reset()

      startY.current = null
      active.current = false
      refreshingRef.current = true
      setRefreshing(true)
      // Hold the indicator at the threshold while the work happens.
      setDistance(PULL.threshold)
      try {
        await onRefreshRef.current()
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        reset()
      }
    }

    // Not passive: the move handler has to be able to prevent the page scrolling.
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', reset, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [enabled, reset])

  return { distance, armed, progress, refreshing }
}
