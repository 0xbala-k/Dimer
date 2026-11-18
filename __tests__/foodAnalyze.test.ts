import { parseAnalyzeInput, buildPhotoContent, MAX_IMAGES } from '../supabase/functions/food-analyze/logic'

describe('parseAnalyzeInput', () => {
  it('accepts the existing single-photo request unchanged', () => {
    const r = parseAnalyzeInput({ mode: 'photo', data: 'abc', description: 'rice bowl' })
    expect(r).toEqual({ ok: true, mode: 'photo', images: ['abc'], text: null, description: 'rice bowl' })
  })

  it('accepts the existing text request unchanged', () => {
    const r = parseAnalyzeInput({ mode: 'text', data: '2 eggs' })
    expect(r).toEqual({ ok: true, mode: 'text', images: [], text: '2 eggs', description: undefined })
  })

  it('accepts up to 4 images', () => {
    const r = parseAnalyzeInput({ mode: 'photo', images: ['a', 'b', 'c', 'd'] })
    expect(r.ok && r.images).toEqual(['a', 'b', 'c', 'd'])
  })

  it.each([
    ['too many images', { mode: 'photo', images: ['a', 'b', 'c', 'd', 'e'] }],
    ['empty image list', { mode: 'photo', images: [] }],
    ['non-string image', { mode: 'photo', images: ['a', 5] }],
    ['empty image string', { mode: 'photo', images: ['a', ''] }],
    ['oversized image', { mode: 'photo', images: ['x'.repeat(7_000_001)] }],
    ['images in text mode', { mode: 'text', images: ['a'] }],
    ['unknown mode', { mode: 'video', data: 'a' }],
    ['non-string description', { mode: 'photo', data: 'a', description: 3 }],
    ['nothing to analyze', { mode: 'photo' }],
  ])('rejects %s', (_label, body) => {
    expect(parseAnalyzeInput(body).ok).toBe(false)
  })

  it('caps the limit at 4', () => {
    expect(MAX_IMAGES).toBe(4)
  })
})

describe('buildPhotoContent', () => {
  it('keeps the single-photo prompt exactly as before', () => {
    const content = buildPhotoContent(['abc'], undefined)
    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'abc' } },
      { type: 'text', text: 'Analyze this food photo and return the JSON.' },
    ])
  })

  it('keeps the single-photo prompt with a description exactly as before', () => {
    const content = buildPhotoContent(['abc'], 'chicken')
    expect(content[1]).toEqual({
      type: 'text',
      text: 'Analyze this food photo and return the JSON. The user describes it as: "chicken". Use this to guide identification and portion estimates, but trust the photo for what is visible.',
    })
  })

  it('sends every image, labelled, with one-meal instructions after them', () => {
    const content = buildPhotoContent(['a', 'b'], 'office lunch')
    const images = content.filter((c) => c.type === 'image')
    expect(images).toHaveLength(2)
    expect(content[0]).toEqual({ type: 'text', text: 'Image 1:' })
    expect(content[2]).toEqual({ type: 'text', text: 'Image 2:' })
    const last = content[content.length - 1]
    expect(last.type).toBe('text')
    const text = (last as { text: string }).text
    expect(text).toMatch(/ONE meal/)
    expect(text).toMatch(/screenshot/i)
    expect(text).toMatch(/portion/i)
    expect(text).toMatch(/single entry/i)
    expect(text).toContain('"office lunch"')
  })
})
