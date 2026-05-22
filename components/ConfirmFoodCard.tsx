import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { supabase } from '../lib/supabase'
import { colors, fonts, radii, spacing } from '../lib/theme'
import { GlassCard } from './GlassCard'
import type { FoodResult } from '../lib/types'

// Exported for unit testing
export function scaleByServing(
  base: Pick<FoodResult, 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber'>,
  newGrams: number,
  originalGrams: number
): typeof base {
  if (originalGrams === 0) return base
  const ratio = newGrams / originalGrams
  return {
    calories: Math.round(base.calories * ratio),
    protein: Math.round(base.protein * ratio * 10) / 10,
    carbs: Math.round(base.carbs * ratio * 10) / 10,
    fats: Math.round(base.fats * ratio * 10) / 10,
    fiber: Math.round(base.fiber * ratio * 10) / 10,
  }
}

interface Props {
  result: FoodResult
  inputMethod: 'photo' | 'text' | 'restaurant' | 'barcode'
  onSaved: () => void
  onRetake: () => void
}

interface EditableFields {
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}

export function ConfirmFoodCard({ result, inputMethod, onSaved, onRetake }: Props) {
  const DEFAULT_GRAMS = 100
  const [servingGrams, setServingGrams] = useState(DEFAULT_GRAMS)
  const [fields, setFields] = useState<EditableFields>({
    name: result.name,
    calories: result.calories,
    protein: result.protein,
    carbs: result.carbs,
    fats: result.fats,
    fiber: result.fiber,
  })
  const [saving, setSaving] = useState(false)

  function changeServing(delta: number) {
    const next = Math.max(10, servingGrams + delta)
    const scaled = scaleByServing(fields, next, servingGrams)
    setServingGrams(next)
    setFields(f => ({ ...f, ...scaled }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('food_logs').insert({
        date: today,
        source: inputMethod,
        name: fields.name,
        calories: fields.calories,
        protein: fields.protein,
        carbs: fields.carbs,
        fats: fields.fats,
        fiber: fields.fiber,
        raw_response: result as unknown as Record<string, unknown>,
      })
      if (error) throw error

      // Upsert daily_summaries consumed total
      const { data: existing } = await supabase
        .from('daily_summaries')
        .select('calories_consumed')
        .eq('date', today)
        .single()

      await supabase.from('daily_summaries').upsert({
        date: today,
        calories_consumed: (existing?.calories_consumed ?? 0) + fields.calories,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date' })

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onSaved()
    } catch (e) {
      Alert.alert('Failed to save', 'Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const MACRO_ITEMS: { key: keyof EditableFields; label: string; color: string }[] = [
    { key: 'protein', label: 'Protein', color: colors.protein },
    { key: 'carbs',   label: 'Carbs',   color: colors.carbs },
    { key: 'fats',    label: 'Fat',     color: colors.fat },
    { key: 'fiber',   label: 'Fiber',   color: colors.fiber },
  ]

  return (
    <View style={s.container}>
      {/* Dish name + calories */}
      <GlassCard style={s.headerCard}>
        <TextInput
          style={s.nameInput}
          value={fields.name}
          onChangeText={(v) => setFields(f => ({ ...f, name: v }))}
          placeholderTextColor={colors.textDim}
        />
        <View style={s.kcalRow}>
          <TextInput
            style={s.kcalInput}
            value={String(fields.calories)}
            keyboardType="numeric"
            onChangeText={(v) => setFields(f => ({ ...f, calories: Number(v) || 0 }))}
            placeholderTextColor={colors.textDim}
          />
          <Text style={s.kcalUnit}>kcal</Text>
        </View>
        <Text style={s.sourceBadge}>{result.source.toUpperCase()} · {(result.confidence ?? 'unknown').toUpperCase()} CONFIDENCE</Text>
      </GlassCard>

      {/* Macros grid */}
      <GlassCard>
        <View style={s.macroGrid}>
          {MACRO_ITEMS.map(({ key, label, color }) => (
            <View key={key} style={s.macroItem}>
              <Text style={s.macroLabel}>{label}</Text>
              <TextInput
                style={[s.macroValue, { color }]}
                value={String(fields[key])}
                keyboardType="decimal-pad"
                onChangeText={(v) => setFields(f => ({ ...f, [key]: Number(v) || 0 }))}
                placeholderTextColor={colors.textDim}
              />
              <Text style={s.macroUnit}>g</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      {/* Serving size */}
      <GlassCard>
        <View style={s.servingRow}>
          <View>
            <Text style={s.servingLabel}>SERVING SIZE</Text>
            <Text style={s.servingValue}>{servingGrams}g</Text>
          </View>
          <View style={s.servingButtons}>
            {[-25, -10, +10, +25].map((delta) => (
              <Pressable
                key={delta}
                style={({ pressed }) => [s.servingBtn, pressed && { opacity: 0.7 }]}
                onPress={() => changeServing(delta)}
              >
                <Text style={s.servingBtnText}>{delta > 0 ? `+${delta}` : delta}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </GlassCard>

      {result.notes && (
        <GlassCard style={s.noteCard}>
          <Text style={s.noteText}>{result.notes}</Text>
        </GlassCard>
      )}

      {/* Action buttons */}
      <View style={s.actions}>
        <Pressable style={({ pressed }) => [s.retakeBtn, pressed && { opacity: 0.7 }]} onPress={onRetake}>
          <Text style={s.retakeText}>Retake</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveText}>{saving ? 'Saving…' : 'Save to Log →'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 10 },
  headerCard: { gap: 4 },
  nameInput: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.text, padding: 0 },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  kcalInput: { fontFamily: fonts.mono, fontSize: 28, color: colors.primary, padding: 0 },
  kcalUnit: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
  sourceBadge: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1, marginTop: 4 },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  macroItem: { flex: 1, minWidth: '40%', gap: 2 },
  macroLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' },
  macroValue: { fontFamily: fonts.mono, fontSize: 18, padding: 0 },
  macroUnit: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim },
  servingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  servingLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' },
  servingValue: { fontFamily: fonts.mono, fontSize: 18, color: colors.text, marginTop: 2 },
  servingButtons: { flexDirection: 'row', gap: 6 },
  servingBtn: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: `${colors.primary}10`, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  servingBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.primary },
  noteCard: { backgroundColor: `${colors.carbs}08`, borderColor: `${colors.carbs}15` },
  noteText: { fontFamily: fonts.body, fontSize: 11, color: colors.carbs, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  retakeBtn: { flex: 0.6, padding: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, alignItems: 'center' },
  retakeText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  saveBtn: { flex: 1.4, padding: 13, backgroundColor: colors.primary, borderRadius: radii.md, alignItems: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  saveText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.bg, textTransform: 'uppercase', letterSpacing: 1 },
})
