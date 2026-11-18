// Web: paste images from the clipboard into the photo tab.
//
// iOS Safari (including the home-screen web app) allows clipboard reads only
// inside a user gesture: navigator.clipboard.read() called straight from the
// tap shows iOS's "Paste" callout, and tapping it hands over the image. So
// readClipboardImages must be called synchronously from the button's press
// handler; its first statement does the read before any await.
//
// The `paste` event covers ⌘V on desktop and long-press → Paste in a field.

export const canPasteImages =
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function'

/** Returns blob: URLs for every image on the clipboard (possibly none). */
export async function readClipboardImages(): Promise<string[]> {
  const items = await navigator.clipboard.read()
  const uris: string[] = []
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    uris.push(URL.createObjectURL(blob))
  }
  return uris
}

/** Calls `cb` with blob: URLs when images are pasted anywhere on the page. Text pastes pass through. */
export function onPasteImages(cb: (uris: string[]) => void): () => void {
  if (typeof document === 'undefined') return () => {}
  function handle(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    cb(files.map((f) => URL.createObjectURL(f)))
  }
  document.addEventListener('paste', handle)
  return () => document.removeEventListener('paste', handle)
}

/** Frees a URL made by this module; other URIs are ignored. */
export function releaseImageUri(uri: string): void {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri)
}
