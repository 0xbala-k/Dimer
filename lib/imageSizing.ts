/**
 * Image sizing for multi-photo food analysis.
 *
 * food-analyze uses Claude Haiku 4.5, a standard-resolution vision model: it
 * downscales any image whose long edge exceeds 1568 px or that costs more than
 * 1568 visual tokens (one token per 28×28 px patch). A tall order screenshot
 * that we squeeze and the model then squeezes again loses small text like
 * "sub chili pineapple", so we resize once, to the largest size the model
 * reads at full detail.
 */
export const MODEL_MAX_EDGE = 1568
export const MODEL_MAX_TOKENS = 1568
const PATCH = 28

/** Visual tokens an image costs: ⌈w/28⌉ × ⌈h/28⌉. */
export function visualTokens(width: number, height: number): number {
  return Math.ceil(width / PATCH) * Math.ceil(height / PATCH)
}

/** Largest size, keeping aspect ratio, within the model's native limits. Never upscales. */
export function fitForModel(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error('invalid_image_size')
  let scale = Math.min(
    1,
    MODEL_MAX_EDGE / Math.max(width, height),
    Math.sqrt((MODEL_MAX_TOKENS * PATCH * PATCH) / (width * height)),
  )
  const size = (s: number) => ({
    width: Math.max(1, Math.floor(width * s)),
    height: Math.max(1, Math.floor(height * s)),
  })
  let out = size(scale)
  // Patch rounding can push the token count just over the budget.
  while (visualTokens(out.width, out.height) > MODEL_MAX_TOKENS) {
    scale *= 0.98
    out = size(scale)
  }
  return out
}
