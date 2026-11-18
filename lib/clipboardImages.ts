// Native: clipboard image paste isn't offered (the photo tab's picker and
// camera cover iOS/Android apps). The web build uses clipboardImages.web.ts.

export const canPasteImages = false

export async function readClipboardImages(): Promise<string[]> {
  return []
}

export function onPasteImages(_cb: (uris: string[]) => void): () => void {
  return () => {}
}

export function releaseImageUri(_uri: string): void {}
