import { describe, expect, test } from 'bun:test'
import { PULL, pullMetrics } from './pull.ts'

describe('pull metrics', () => {
  test('a finger that has not moved shows nothing', () => {
    expect(pullMetrics(0)).toEqual({ distance: 0, armed: false, progress: 0 })
  })

  test('pulling upward is not a pull-to-refresh', () => {
    expect(pullMetrics(-120).distance).toBe(0)
  })

  test('the indicator follows the finger, but lags behind it', () => {
    const { distance } = pullMetrics(100)

    // Resistance is what makes a pull feel like it is against something.
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThan(100)
  })

  test('a short pull is not armed', () => {
    expect(pullMetrics(30).armed).toBe(false)
  })

  test('a long pull arms the refresh', () => {
    expect(pullMetrics(PULL.threshold / PULL.resistance + 1).armed).toBe(true)
  })

  test('travel is capped, so a hard drag does not stretch the page', () => {
    expect(pullMetrics(5000).distance).toBeLessThanOrEqual(PULL.max)
  })

  test('progress runs from nothing to full as the pull arms', () => {
    expect(pullMetrics(0).progress).toBe(0)
    expect(pullMetrics(PULL.threshold / PULL.resistance).progress).toBeCloseTo(1, 1)
    expect(pullMetrics(5000).progress).toBe(1)
  })

  test('distance grows as the pull grows', () => {
    const short = pullMetrics(40).distance
    const longer = pullMetrics(80).distance

    expect(longer).toBeGreaterThan(short)
  })

  test('arming is the same test the release uses', () => {
    // The indicator must not promise a refresh the release then declines to perform.
    const raw = PULL.threshold / PULL.resistance + 5
    const { armed, distance } = pullMetrics(raw)

    expect(armed).toBe(true)
    expect(distance).toBeGreaterThanOrEqual(PULL.threshold)
  })
})
