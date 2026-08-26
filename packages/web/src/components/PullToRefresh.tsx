import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { PULL } from '../hooks/pull.ts'
import { usePullToRefresh } from '../hooks/usePullToRefresh.ts'

/**
 * The pull-to-refresh indicator.
 *
 * It borrows the app's one chromatic note: the safelight arc fills as you pull, and
 * turns solid the moment releasing would actually refresh — so the control tells you
 * what will happen before you commit to it, rather than after.
 */
export function PullToRefresh() {
  const queryClient = useQueryClient()

  const onRefresh = useCallback(async () => {
    // Whatever page this is, refetch what it is showing.
    await queryClient.refetchQueries({ type: 'active' })
  }, [queryClient])

  const { distance, armed, progress, refreshing } = usePullToRefresh({ onRefresh })

  if (distance <= 0 && !refreshing) return null

  const circumference = 2 * Math.PI * 9

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center md:hidden"
      style={{
        transform: `translateY(${distance - PULL.max * 0.35}px)`,
        transition: refreshing ? 'transform 200ms ease-out' : 'none',
      }}
    >
      <div
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface shadow-[0_2px_10px_rgb(0_0_0/0.12)]"
        style={{
          opacity: Math.min(1, progress + 0.25),
          transform: `scale(${0.8 + progress * 0.2})`,
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-line"
          />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-safelight"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (refreshing ? 0.25 : progress))}
            transform="rotate(-90 12 12)"
            style={{ opacity: armed || refreshing ? 1 : 0.75 }}
          />
        </svg>
      </div>
    </div>
  )
}
