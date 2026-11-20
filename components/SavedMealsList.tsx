import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { haptics, ImpactFeedbackStyle, NotificationFeedbackType } from '../lib/haptics'
import { showAlert } from '../lib/alert'
import { saveErrorMessage } from '../lib/saveError'
import { parseAmount, type MealValues } from '../lib/savedMeals'
import { colors, fonts, radii } from '../lib/theme'
import type { SavedMeal } from '../lib/types'

interface Props {
  meals: SavedMeal[]
  onLog: (meal: SavedMeal) => Promise<void>
  onUpdate: (id: string, values: MealValues) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

const COLLAPSED_COUNT = 4

export function SavedMealsList({ meals, onLog, onUpdate, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (meals.length === 0) return null
  const visible = showAll ? meals : meals.slice(0, COLLAPSED_COUNT)

  async function handleLog(meal: SavedMeal) {
    setBusyId(meal.id)
    try {
      await onLog(meal)
      haptics.notification(NotificationFeedbackType.Success)
    } catch (e) {
      console.error('[SavedMealsList] log failed:', e)
      showAlert('Failed to log', saveErrorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  function handleDelete(meal: SavedMeal) {
    showAlert('Delete saved meal?', meal.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          haptics.impact(ImpactFeedbackStyle.Medium)
          try {
            await onDelete(meal.id)
            if (editingId === meal.id) setEditingId(null)
          } catch (e) {
            console.error('[SavedMealsList] delete failed:', e)
            showAlert('Failed to delete', saveErrorMessage(e))
          }
        },
      },
    ])
  }

  return (
    <View style={s.section}>
      <Text style={s.heading}>SAVED MEALS</Text>
      {visible.map((meal) =>
        editingId === meal.id ? (
          <SavedMealEditor
            key={meal.id}
            meal={meal}
            onCancel={() => setEditingId(null)}
            onSave={async (values) => {
              await onUpdate(meal.id, values)
              setEditingId(null)
            }}
            onDelete={() => handleDelete(meal)}
          />
        ) : (
          <View key={meal.id} style={s.row}>
            <Pressable
              style={{ flex: 1 }}
              onPress={() => setEditingId(meal.id)}
              accessibilityLabel={`Edit ${meal.name}`}
            >
              <Text style={s.name} numberOfLines={1}>{meal.name}</Text>
              <Text style={s.meta}>
                {meal.calories} kcal · P {meal.protein}g · C {meal.carbs}g · F {meal.fats}g
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.7 }]}
              onPress={() => setEditingId(meal.id)}
              accessibilityLabel={`Edit ${meal.name}`}
            >
              <Text style={s.iconText}>Edit</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.logBtn, pressed && { opacity: 0.85 }, busyId === meal.id && { opacity: 0.6 }]}
              onPress={() => handleLog(meal)}
              disabled={busyId === meal.id}
              accessibilityLabel={`Log ${meal.name} today`}
            >
              <Text style={s.logText}>{busyId === meal.id ? '…' : '+ Log'}</Text>
            </Pressable>
          </View>
        )
      )}
      {meals.length > COLLAPSED_COUNT && (
        <Pressable onPress={() => setShowAll(v => !v)} style={s.moreBtn}>
          <Text style={s.moreText}>{showAll ? 'Show less' : `Show all ${meals.length}`}</Text>
        </Pressable>
      )}
    </View>
  )
}

interface EditorProps {
  meal: SavedMeal
  onSave: (values: MealValues) => Promise<void>
  onCancel: () => void
  onDelete: () => void
}

type FieldKey = 'calories' | 'protein' | 'carbs' | 'fats' | 'fiber'

const FIELDS: { key: FieldKey; label: string; color: string }[] = [
  { key: 'calories', label: 'Kcal', color: colors.primary },
  { key: 'protein', label: 'Protein', color: colors.protein },
  { key: 'carbs', label: 'Carbs', color: colors.carbs },
  { key: 'fats', label: 'Fat', color: colors.fat },
  { key: 'fiber', label: 'Fiber', color: colors.fiber },
]

function SavedMealEditor({ meal, onSave, onCancel, onDelete }: EditorProps) {
  const [name, setName] = useState(meal.name)
  // Kept as text so a half-typed "12." isn't clobbered while editing.
  const [amounts, setAmounts] = useState<Record<FieldKey, string>>(() => ({
    calories: String(meal.calories),
    protein: String(meal.protein),
    carbs: String(meal.carbs),
    fats: String(meal.fats),
    fiber: String(meal.fiber),
  }))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        name: name.trim() || meal.name,
        calories: parseAmount(amounts.calories),
        protein: parseAmount(amounts.protein),
        carbs: parseAmount(amounts.carbs),
        fats: parseAmount(amounts.fats),
        fiber: parseAmount(amounts.fiber),
      })
      haptics.notification(NotificationFeedbackType.Success)
    } catch (e) {
      console.error('[SavedMealEditor] save failed:', e)
      showAlert('Failed to save', saveErrorMessage(e))
      setSaving(false)
    }
  }

  return (
    <View style={[s.row, s.editor]}>
      <TextInput
        style={s.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Meal name"
        placeholderTextColor={colors.textDim}
      />
      <View style={s.fieldGrid}>
        {FIELDS.map(({ key, label, color }) => (
          <View key={key} style={s.field}>
            <Text style={s.fieldLabel}>{label}</Text>
            <TextInput
              style={[s.fieldInput, { color }]}
              value={amounts[key]}
              keyboardType="decimal-pad"
              onChangeText={(v) => setAmounts(a => ({ ...a, [key]: v }))}
              placeholderTextColor={colors.textDim}
            />
          </View>
        ))}
      </View>
      <View style={s.editorActions}>
        <Pressable style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }]} onPress={onDelete}>
          <Text style={s.deleteText}>Delete</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]} onPress={onCancel}>
          <Text style={s.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  section: { gap: 6, marginBottom: 14 },
  heading: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 10 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  meta: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, marginTop: 2 },
  iconBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.cardBorder },
  iconText: { fontFamily: fonts.labelSemiBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  logBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.sm, backgroundColor: colors.primary, minWidth: 56, alignItems: 'center' },
  logText: { fontFamily: fonts.labelSemiBold, fontSize: 10, color: colors.bg, textTransform: 'uppercase', letterSpacing: 0.5 },
  moreBtn: { alignItems: 'center', paddingVertical: 4 },
  moreText: { fontFamily: fonts.label, fontSize: 10, color: colors.primary, letterSpacing: 0.5 },
  editor: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  nameInput: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, padding: 0 },
  fieldGrid: { flexDirection: 'row', gap: 8 },
  field: { flex: 1, gap: 2 },
  fieldLabel: { fontFamily: fonts.label, fontSize: 8, color: colors.textDim, letterSpacing: 1, textTransform: 'uppercase' },
  fieldInput: { fontFamily: fonts.mono, fontSize: 14, padding: 0 },
  editorActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 7 },
  deleteText: { fontFamily: fonts.labelSemiBold, fontSize: 10, color: colors.danger, textTransform: 'uppercase', letterSpacing: 0.5 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.cardBorder },
  cancelText: { fontFamily: fonts.labelSemiBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.sm, backgroundColor: colors.primary },
  saveText: { fontFamily: fonts.labelSemiBold, fontSize: 10, color: colors.bg, textTransform: 'uppercase', letterSpacing: 0.5 },
})
