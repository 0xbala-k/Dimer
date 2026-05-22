import { useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { colors, fonts, radii } from '../lib/theme'
import type { FoodLog } from '../lib/types'

const SOURCE_COLORS: Record<FoodLog['source'], string> = {
  photo: colors.protein,
  text: colors.carbs,
  restaurant: colors.fat,
  barcode: colors.fiber,
}

interface Props {
  log: FoodLog
  onDelete: (id: string) => void
}

export function FoodLogItem({ log, onDelete }: Props) {
  const swipeRef = useRef<Swipeable>(null)

  function handleDelete() {
    Alert.alert('Delete entry?', log.name, [
      { text: 'Cancel', onPress: () => swipeRef.current?.close() },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          onDelete(log.id)
        },
      },
    ])
  }

  function renderRightActions() {
    return (
      <Pressable style={s.deleteAction} onPress={handleDelete}>
        <Text style={s.deleteText}>Delete</Text>
      </Pressable>
    )
  }

  const accentColor = SOURCE_COLORS[log.source]
  const time = new Date(log.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} overshootRight={false}>
      <View style={s.container}>
        <View style={[s.accent, { backgroundColor: accentColor }]} />
        <View style={[s.iconWrap, { backgroundColor: `${accentColor}15` }]}>
          <View style={[s.iconDot, { backgroundColor: accentColor }]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{log.name}</Text>
          <Text style={s.meta}>
            P {log.protein}g · C {log.carbs}g · F {log.fats}g · Fi {log.fiber}g · {time}
          </Text>
        </View>
        <Text style={[s.kcal, { color: accentColor }]}>{log.calories}</Text>
      </View>
    </Swipeable>
  )
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 10,
    marginHorizontal: 14,
    marginBottom: 5,
  },
  accent: { width: 2, height: '80%', borderRadius: 1, alignSelf: 'center' },
  iconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  iconDot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  meta: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, marginTop: 1 },
  kcal: { fontFamily: fonts.mono, fontSize: 14 },
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: radii.md,
    marginLeft: 6,
    marginBottom: 5,
    marginRight: 14,
  },
  deleteText: { fontFamily: fonts.labelSemiBold, fontSize: 12, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
})
