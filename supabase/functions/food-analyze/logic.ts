// supabase/functions/food-analyze/logic.ts
//
// Pure request parsing and prompt building for food-analyze, kept free of
// Deno APIs so Jest can test it.

export const MAX_IMAGES = 4
/** Base64 characters per image (~5 MB decoded); Claude allows 10 MB base64. */
export const MAX_IMAGE_CHARS = 7_000_000

export type AnalyzeInput =
  | { ok: true; mode: 'photo' | 'text'; images: string[]; text: string | null; description: string | undefined }
  | { ok: false }

/**
 * Accepts the original shapes ({ mode: 'photo', data } with one base64 JPEG,
 * { mode: 'text', data }) and the multi-photo shape ({ mode: 'photo', images }).
 */
export function parseAnalyzeInput(body: unknown): AnalyzeInput {
  const b = (body ?? {}) as Record<string, unknown>
  const { mode, data, images, description } = b
  if (mode !== 'photo' && mode !== 'text') return { ok: false }
  if (description !== undefined && typeof description !== 'string') return { ok: false }

  if (mode === 'text') {
    if (images !== undefined || typeof data !== 'string') return { ok: false }
    return { ok: true, mode, images: [], text: data, description }
  }

  let list: unknown[]
  if (images !== undefined) {
    if (!Array.isArray(images)) return { ok: false }
    list = images
  } else if (typeof data === 'string') {
    list = [data]
  } else {
    return { ok: false }
  }
  if (list.length < 1 || list.length > MAX_IMAGES) return { ok: false }
  if (!list.every((x) => typeof x === 'string' && x.length > 0 && x.length <= MAX_IMAGE_CHARS)) {
    return { ok: false }
  }
  return { ok: true, mode, images: list as string[], text: null, description }
}

type Block =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  | { type: 'text'; text: string }

const image = (data: string): Block => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })

/** User-turn content for a photo analysis. `description` is user text: it stays in the user turn. */
export function buildPhotoContent(images: string[], description: string | undefined): Block[] {
  const hint = description?.trim().slice(0, 500)

  if (images.length === 1) {
    // Unchanged from the single-photo version.
    const text = hint
      ? `Analyze this food photo and return the JSON. The user describes it as: "${hint}". Use this to guide identification and portion estimates, but trust the photo for what is visible.`
      : 'Analyze this food photo and return the JSON.'
    return [image(images[0]), { type: 'text', text }]
  }

  const blocks: Block[] = []
  images.forEach((data, i) => {
    blocks.push({ type: 'text', text: `Image ${i + 1}:` })
    blocks.push(image(data))
  })
  const lines = [
    `These ${images.length} images all show ONE meal. Analyze them together and return the JSON for that one meal.`,
    '- Some images may be order screenshots or receipts (for example from a delivery or office-lunch app). Read the dish name, size and every modifier from them as text, including removals (e.g. "NO mac salad") and substitutions (e.g. "sub chili pineapple"), and build the ingredients from that.',
    '- Use photos of the actual food to judge portion size. If there is no food photo, use the standard portion for the ordered item.',
    '- Return a single entry for the whole meal, not one per image. Do not count an item twice when it appears in both a screenshot and a photo.',
    '- Name the meal after the ordered dish when a screenshot names it.',
  ]
  if (hint) lines.push(`The user describes the meal as: "${hint}". Use this as a guide.`)
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}
