import { fitForModel, visualTokens, MODEL_MAX_EDGE, MODEL_MAX_TOKENS } from '../lib/imageSizing'

describe('fitForModel', () => {
  it('leaves an image that already fits unchanged', () => {
    expect(fitForModel(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('shrinks a tall phone screenshot so text is not downscaled again by the model', () => {
    const { width, height } = fitForModel(1179, 2556)
    expect(Math.max(width, height)).toBeLessThanOrEqual(MODEL_MAX_EDGE)
    expect(visualTokens(width, height)).toBeLessThanOrEqual(MODEL_MAX_TOKENS)
    // Keeps as much width as the limits allow (much more than a 50% cut).
    expect(width).toBeGreaterThan(650)
    expect(width / height).toBeCloseTo(1179 / 2556, 2)
  })

  it('shrinks a 12MP camera photo to the token budget', () => {
    const { width, height } = fitForModel(4032, 3024)
    expect(visualTokens(width, height)).toBeLessThanOrEqual(MODEL_MAX_TOKENS)
    expect(width).toBeGreaterThan(1100)
    expect(width / height).toBeCloseTo(4 / 3, 2)
  })

  it('handles a very wide image by the long-edge limit', () => {
    const { width, height } = fitForModel(6000, 300)
    expect(width).toBeLessThanOrEqual(MODEL_MAX_EDGE)
    expect(height).toBeGreaterThanOrEqual(1)
  })

  it('rejects non-positive sizes', () => {
    expect(() => fitForModel(0, 100)).toThrow()
  })
})
