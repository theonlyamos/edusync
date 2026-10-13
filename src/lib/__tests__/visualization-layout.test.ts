import { describe, expect, it } from 'vitest'
import { normalizeVisualizationDimensions } from '../visualization-layout'

describe('drawable visualization dimensions', () => {
  it('keeps the actual small drawable size, rounds CSS pixels, and caps excessive dimensions', () => {
    expect(normalizeVisualizationDimensions({ width: 320.4, height: 239.6 })).toEqual({ width: 320, height: 240 })
    expect(normalizeVisualizationDimensions({ width: 1e12, height: 0.4 })).toEqual({ width: 4096, height: 1 })
  })

  it.each([undefined, null, [], '320x480', { width: -1, height: 0 },
    { width: NaN, height: Infinity }, { width: '320', height: true }])('falls back safely for invalid dimensions %j', (input) => {
    expect(normalizeVisualizationDimensions(input)).toEqual({ width: 800, height: 600 })
  })

  it('preserves a valid axis when the other axis is missing', () => {
    expect(normalizeVisualizationDimensions({ width: 320 })).toEqual({ width: 320, height: 600 })
  })
})
