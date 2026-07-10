import { useState } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { showAlert } from '../lib/alert'
import * as ImageManipulator from 'expo-image-manipulator'
import Svg, { Path, Circle } from 'react-native-svg'
import { analyzeFood } from '../lib/api'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

async function compressForAPI(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  )
  return result.base64!
}

export function PhotoInput({ onResult }: Props) {
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')

  async function pickAndAnalyze(fromCamera: boolean) {
    const fn = fromCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync
    const result = await fn({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 })
    if (result.canceled || !result.assets[0]) return

    setLoading(true)
    try {
      const base64 = await compressForAPI(result.assets[0].uri)
      const food = await analyzeFood({ mode: 'photo', data: base64, description: description.trim() || undefined })
      onResult(food)
    } catch (e) {
      showAlert('Could not analyze photo', 'Try a clearer photo or use text entry.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.container}>
      <Pressable style={[s.zone, loading && { opacity: 0.5 }]} onPress={() => pickAndAnalyze(false)} disabled={loading}>
        <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={colors.textDim} strokeWidth={1.5}>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={12} cy={13} r={4} />
        </Svg>
        {loading
          ? <ActivityIndicator color={colors.primary} />
          : <Text style={s.hint}>Tap to <Text style={{ color: colors.primary }}>choose from library</Text></Text>
        }
      </Pressable>

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
        <Pressable style={({ pressed }) => [s.btnSecondary, pressed && { opacity: 0.7 }]} onPress={() => pickAndAnalyze(true)} disabled={loading}>
          <Text style={s.btnSecText}>Open Camera</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [s.btnPrimary, pressed && { opacity: 0.85 }]} onPress={() => pickAndAnalyze(false)} disabled={loading}>
          <Text style={s.btnPriText}>Choose Photo →</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 12 },
  zone: { backgroundColor: `${colors.primary}05`, borderWidth: 1, borderStyle: 'dashed', borderColor: `${colors.primary}18`, borderRadius: radii.lg, height: 130, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
  descInput: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  btnSecondary: { flex: 1, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, alignItems: 'center' },
  btnSecText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  btnPrimary: { flex: 1.5, padding: 13, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnPriText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
})
