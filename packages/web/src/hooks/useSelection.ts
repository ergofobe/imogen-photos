import { useCallback, useRef, useState } from 'react'

/**
 * Multi-select with a shift-click range, because choosing eighty holiday photos one
 * click at a time is not a thing anyone should have to do.
 */
export function useSelection(orderedIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)

  const toggle = useCallback(
    (id: string, shiftKey = false) => {
      setSelected((current) => {
        const next = new Set(current)

        if (shiftKey && anchor.current) {
          const from = orderedIds.indexOf(anchor.current)
          const to = orderedIds.indexOf(id)
          if (from >= 0 && to >= 0) {
            const [start, end] = from < to ? [from, to] : [to, from]
            for (const rangeId of orderedIds.slice(start, end + 1)) next.add(rangeId)
            return next
          }
        }

        if (next.has(id)) next.delete(id)
        else next.add(id)
        anchor.current = id
        return next
      })
    },
    [orderedIds],
  )

  const clear = useCallback(() => {
    setSelected(new Set())
    anchor.current = null
  }, [])

  const selectAll = useCallback(() => setSelected(new Set(orderedIds)), [orderedIds])

  return { selected, toggle, clear, selectAll }
}
