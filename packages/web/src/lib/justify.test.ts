import { describe, expect, test } from 'bun:test'
import { justify } from './justify.ts'

const wide = { id: 'w', aspect: 3 / 2 }
const tall = { id: 't', aspect: 2 / 3 }
const square = { id: 's', aspect: 1 }

function items(count: number, aspect = 3 / 2) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, aspect }))
}

describe('justified rows', () => {
  test('fills each full row to exactly the container width', () => {
    const rows = justify(items(12), { width: 1000, targetHeight: 220, gap: 4 })

    for (const row of rows.slice(0, -1)) {
      const used = row.items.reduce((sum, i) => sum + i.width, 0) + row.gapTotal
      expect(used).toBeCloseTo(1000, 1)
    }
  })

  test('keeps every photo at its original aspect ratio', () => {
    const rows = justify([wide, tall, square], { width: 900, targetHeight: 200, gap: 4 })

    for (const row of rows) {
      for (const item of row.items) {
        const source = [wide, tall, square].find((s) => s.id === item.id)!
        expect(item.width / item.height).toBeCloseTo(source.aspect, 2)
      }
    }
  })

  test('places every item exactly once', () => {
    const rows = justify(items(37), { width: 1200, targetHeight: 200, gap: 4 })

    const placed = rows.flatMap((r) => r.items.map((i) => i.id))
    expect(placed).toHaveLength(37)
    expect(new Set(placed).size).toBe(37)
  })

  test('preserves order', () => {
    const rows = justify(items(20), { width: 800, targetHeight: 180, gap: 4 })

    const placed = rows.flatMap((r) => r.items.map((i) => i.id))
    expect(placed).toEqual(items(20).map((i) => i.id))
  })

  test('does not stretch a short final row across the full width', () => {
    // Two wide photos cannot honestly fill a row sized for five.
    const rows = justify(items(2), { width: 2000, targetHeight: 200, gap: 4 })

    const last = rows.at(-1)!
    const used = last.items.reduce((sum, i) => sum + i.width, 0)
    expect(used).toBeLessThan(2000)
    expect(last.height).toBeCloseTo(200, 0)
  })

  test('never lets a row grow absurdly tall on a narrow screen', () => {
    // One panorama on a phone would otherwise scale to a very tall row.
    const rows = justify([{ id: 'pano', aspect: 6 }], { width: 380, targetHeight: 220, gap: 4 })

    expect(rows[0]!.height).toBeLessThanOrEqual(220)
  })

  test('caps how tall a row may become when justified', () => {
    const rows = justify([tall, tall], { width: 1400, targetHeight: 200, gap: 4, maxHeight: 320 })

    for (const row of rows) expect(row.height).toBeLessThanOrEqual(320)
  })

  test('reports a stable vertical offset for each row', () => {
    const rows = justify(items(15), { width: 1000, targetHeight: 200, gap: 6 })

    let expected = 0
    for (const row of rows) {
      expect(row.top).toBeCloseTo(expected, 1)
      expected += row.height + 6
    }
  })

  test('handles an empty library', () => {
    expect(justify([], { width: 1000, targetHeight: 200, gap: 4 })).toEqual([])
  })

  test('survives a zero-width container during first paint', () => {
    expect(justify(items(5), { width: 0, targetHeight: 200, gap: 4 })).toEqual([])
  })

  test('falls back to a sane aspect when dimensions are unknown', () => {
    // A still-processing upload has no width or height yet.
    const rows = justify([{ id: 'pending', aspect: 0 }], { width: 900, targetHeight: 200, gap: 4 })

    expect(rows[0]!.items[0]!.width).toBeGreaterThan(0)
    expect(rows[0]!.items[0]!.height).toBeGreaterThan(0)
  })
})
