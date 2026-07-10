import { useState } from 'react'
import { View, TextInput, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { analyzeFood } from '../lib/api'
import { showAlert } from '../lib/alert'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function TextFoodInput({ onResult }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAnalyze() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const result = await analyzeFood({ mode: 'text', data: text.trim() })
      onResult(result)
    } catch {
      showAlert('Could not analyze', 'Try being more specific, e.g. "200g grilled salmon".')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.container}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder={'e.g. "200g grilled chicken breast" or "large bowl of oatmeal"'}
        placeholderTextColor={colors.textDim}
        multiline
        autoFocus
        returnKeyType="done"
      />
      <Text style={s.hint}>Include weight for more accurate results</Text>
      <Pressable
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }, (!text.trim() || loading) && { opacity: 0.5 }]}
        onPress={handleAnalyze}
        disabled={!text.trim() || loading}
      >
        {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Analyze →</Text>}
      </Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 10 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  hint: { fontFamily: fonts.label, fontSize: 11, color: colors.textDim },
  btn: { padding: 14, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center' },
  btnText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
})
