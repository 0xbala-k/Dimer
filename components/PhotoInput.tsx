import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, Image, StyleSheet } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import Svg, { Path, Circle, Line } from 'react-native-svg'
import { showAlert } from '../lib/alert'
import { analyzeFood } from '../lib/api'
import { prepareSinglePhoto, prepareMealImage } from '../lib/photoPrep'
import { canPasteImages, readClipboardImages, onPasteImages, releaseImageUri } from '../lib/clipboardImages'
import { MAX_IMAGES } from '../supabase/functions/food-analyze/logic'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

interface Picked {
  id: string
  uri: string
  width?: number
  height?: number
}

let nextId = 0
const newId = () => `p${++nextId}`

export function PhotoInput({ onResult }: Props) {
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<Picked[]>([])
  const photosRef = useRef(photos)
  photosRef.current = photos

  const remaining = MAX_IMAGES - photos.length
  const full = remaining <= 0

  /** Adds images up to the limit; anything past it is released and reported. */
  function add(items: Omit<Picked, 'id'>[]) {
    if (items.length === 0) return
    const room = MAX_IMAGES - photosRef.current.length
    const kept = items.slice(0, Math.max(0, room))
    items.slice(kept.length).forEach((p) => releaseImageUri(p.uri))
    if (kept.length < items.length) {
      showAlert(`Up to ${MAX_IMAGES} photos`, `Only the first ${kept.length || 'none'} of those were added.`)
    }
    if (kept.length) setPhotos((prev) => [...prev, ...kept.map((p) => ({ ...p, id: newId() }))])
  }

  function remove(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id)
      if (gone) releaseImageUri(gone.uri)
      return prev.filter((p) => p.id !== id)
    })
  }

  // Pasting anywhere while the photo tab is open (⌘V, or long-press → Paste in the field).
  useEffect(() => onPasteImages((uris) => add(uris.map((uri) => ({ uri })))), [])

  // Free pasted images when the tab closes.
  useEffect(() => () => photosRef.current.forEach((p) => releaseImageUri(p.uri)), [])

  async function pick(fromCamera: boolean) {
    if (photosRef.current.length >= MAX_IMAGES) return
    const fn = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync
    const result = await fn({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: !fromCamera,
      selectionLimit: MAX_IMAGES - photosRef.current.length,
    })
    if (result.canceled) return
    add(result.assets.map((a) => ({ uri: a.uri, width: a.width || undefined, height: a.height || undefined })))
  }

  function paste() {
    // Must start the clipboard read inside this tap (see clipboardImages.web.ts).
    readClipboardImages()
      .then((uris) => {
        if (uris.length === 0) showAlert('No image to paste', 'Copy a screenshot or photo first.')
        else add(uris.map((uri) => ({ uri })))
      })
      .catch((e) => {
        // The user dismissing iOS's Paste callout lands here too; stay quiet then.
        if (e?.name !== 'NotAllowedError') showAlert('Could not paste', 'Copy the image again and retry.')
      })
  }

  async function analyze() {
    if (photos.length === 0) return
    setLoading(true)
    try {
      const images = photos.length === 1
        ? [await prepareSinglePhoto(photos[0].uri)]
        : await Promise.all(photos.map((p) => prepareMealImage(p.uri, p.width, p.height)))
      const food = await analyzeFood({ mode: 'photo', images, description: description.trim() || undefined })
      onResult(food)
    } catch (e) {
      console.error('[PhotoInput] analyze failed:', e)
      showAlert(
        photos.length > 1 ? 'Could not analyze photos' : 'Could not analyze photo',
        'Try clearer photos or use text entry.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.container}>
      {photos.length === 0 ? (
        <Pressable style={s.zone} onPress={() => pick(false)} accessibilityLabel="Choose photos from library">
          <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth={1.5}>
            <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={12} cy={13} r={4} />
          </Svg>
          <Text style={s.hint}>Tap to <Text style={{ color: colors.primary }}>choose from library</Text></Text>
          <Text style={s.subHint}>Up to {MAX_IMAGES}: e.g. the order screenshot plus a photo of the food</Text>
        </Pressable>
      ) : (
        <View style={s.thumbs}>
          {photos.map((p) => (
            <View key={p.id} style={s.thumb}>
              <Image source={{ uri: p.uri }} style={s.thumbImg} resizeMode="cover" />
              {!loading && (
                <Pressable
                  style={s.remove}
                  onPress={() => remove(p.id)}
                  hitSlop={8}
                  accessibilityLabel="Remove photo"
                >
                  <Svg width={10} height={10} viewBox="0 0 10 10" stroke={colors.text} strokeWidth={1.8}>
                    <Line x1={1} y1={1} x2={9} y2={9} strokeLinecap="round" />
                    <Line x1={9} y1={1} x2={1} y2={9} strokeLinecap="round" />
                  </Svg>
                </Pressable>
              )}
            </View>
          ))}
          {!full && !loading && (
            <Pressable style={[s.thumb, s.addTile]} onPress={() => pick(false)} accessibilityLabel="Add another photo">
              <Text style={s.addPlus}>+</Text>
            </Pressable>
          )}
          <Text style={s.count}>{photos.length} of {MAX_IMAGES}</Text>
        </View>
      )}

      <TextInput
        style={s.descInput}
        value={description}
        onChangeText={setDescription}
        placeholder={'Optional: describe the food, e.g. "grilled chicken, extra rice"'}
        placeholderTextColor={colors.textDim}
        maxLength={500}
        editable={!loading}
        returnKeyType="done"
        accessibilityLabel="Optional food description"
      />

      <View style={s.actions}>
        <Pressable
          style={({ pressed }) => [s.btnSecondary, (full || loading) && s.disabled, pressed && { opacity: 0.7 }]}
          onPress={() => pick(true)}
          disabled={full || loading}
        >
          <Text style={s.btnSecText}>Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.btnSecondary, (full || loading) && s.disabled, pressed && { opacity: 0.7 }]}
          onPress={() => pick(false)}
          disabled={full || loading}
        >
          <Text style={s.btnSecText}>Library</Text>
        </Pressable>
        {canPasteImages && (
          <Pressable
            style={({ pressed }) => [s.btnSecondary, (full || loading) && s.disabled, pressed && { opacity: 0.7 }]}
            onPress={paste}
            disabled={full || loading}
            accessibilityLabel="Paste image from clipboard"
          >
            <Text style={s.btnSecText}>Paste</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [s.btnPrimary, (photos.length === 0 || loading) && s.disabled, pressed && { opacity: 0.85 }]}
        onPress={analyze}
        disabled={photos.length === 0 || loading}
      >
        {loading
          ? <ActivityIndicator color={colors.bg} />
          : <Text style={s.btnPriText}>
              {photos.length > 1 ? `Analyze ${photos.length} photos →` : 'Analyze photo →'}
            </Text>
        }
      </Pressable>
    </View>
  )
}

const THUMB = 72

const s = StyleSheet.create({
  container: { gap: 12 },
  zone: { backgroundColor: `${colors.primary}05`, borderWidth: 1, borderStyle: 'dashed', borderColor: `${colors.primary}18`, borderRadius: radii.lg, height: 130, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  hint: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
  subHint: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim, textAlign: 'center' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, minHeight: 130, paddingVertical: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  thumbImg: { width: '100%', height: '100%' },
  remove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(7,11,20,0.8)', alignItems: 'center', justifyContent: 'center' },
  addTile: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: `${colors.primary}30` },
  addPlus: { fontFamily: fonts.display, fontSize: 24, color: colors.primary },
  count: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim, marginLeft: 4 },
  descInput: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  btnSecondary: { flex: 1, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, alignItems: 'center' },
  btnSecText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  btnPrimary: { padding: 13, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  btnPriText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
  disabled: { opacity: 0.4 },
})
