import * as ImageManipulator from 'expo-image-manipulator'
import { fitForModel } from './imageSizing'

/** A single photo: the original compression, unchanged (800 px wide, JPEG 0.7). */
export async function prepareSinglePhoto(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  )
  return result.base64!
}

/**
 * One of several images of a meal: resized to the largest size the model
 * reads at full detail, so screenshot text stays legible. Re-encoded as JPEG,
 * which also turns pasted PNG screenshots into the type the function sends.
 */
export async function prepareMealImage(uri: string, width?: number, height?: number): Promise<string> {
  let w = width
  let h = height
  if (!w || !h) {
    const probe = await ImageManipulator.manipulateAsync(uri, [])
    w = probe.width
    h = probe.height
  }
  const size = fitForModel(w, h)
  const actions = size.width < w ? [{ resize: size }] : []
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  })
  return result.base64!
}
