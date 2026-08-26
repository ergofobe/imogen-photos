/** Tuning for the pull-to-refresh gesture, in CSS pixels of finger travel. */
export const PULL = {
  /** How far the indicator must travel before releasing will refresh. */
  threshold: 64,
  /** The furthest the indicator ever travels, however hard someone drags. */
  max: 104,
  /**
   * How much of the finger's movement the indicator follows. Less than one is what
   * makes the gesture feel like it is pulling against something rather than sliding.
   */
  resistance: 0.6,
} as const

export type PullState = {
  /** How far to move the indicator, in pixels. */
  distance: number
  /** Whether releasing now would refresh. */
  armed: boolean
  /** 0 to 1, for drawing the indicator filling up. */
  progress: number
}

export function pullMetrics(rawDelta: number): PullState {
  if (rawDelta <= 0) return { distance: 0, armed: false, progress: 0 }

  const distance = Math.min(PULL.max, rawDelta * PULL.resistance)
  return {
    distance,
    armed: distance >= PULL.threshold,
    progress: Math.min(1, distance / PULL.threshold),
  }
}
