import { useRef, useCallback } from 'react'
import * as Haptics from 'expo-haptics'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type BottomSheet from '@gorhom/bottom-sheet'
import { DeficitRing } from '../../../components/DeficitRing'
import { MacroBar } from '../../../components/MacroBar'
import { WhoopBadge } from '../../../components/WhoopBadge'
import { GlassCard } from '../../../components/GlassCard'
import { AddFoodSheet } from '../../../components/AddFoodSheet'
import { useWhoopData } from '../../../hooks/useWhoopData'
import { useFoodLog } from '../../../hooks/useFoodLog'
import { useDeficit } from '../../../hooks/useDeficit'
import type { FoodLog } from '../../../lib/types'
import { colors, fonts, spacing } from '../../../lib/theme'

export default function DashboardScreen() {
  const sheetRef = useRef<BottomSheet>(null)
  const { data: whoopData, loading: whoopLoading } = useWhoopData()
  const { logs, totalCalories } = useFoodLog()
  const deficit = useDeficit(whoopData?.burned ?? 0, logs)

  const burned = whoopData?.burned ?? 0
  const consumed = totalCalories

  const openSheet = useCallback(() => sheetRef.current?.expand(), [])

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View>
            <Text style={s.day}>{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</Text>
            <Text style={s.date}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
          </View>
          <WhoopBadge strain={whoopData?.strain ?? null} recovery={whoopData?.recovery ?? null} />
        </View>

        <View style={s.ringWrap}>
          <DeficitRing burned={burned} consumed={consumed} />
          <View style={s.burnConsumed}>
            <View style={s.bcItem}>
              <Text style={s.bcLabel}>BURNED</Text>
              <Text style={s.bcValue}>{burned.toLocaleString()}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.bcItem}>
              <Text style={s.bcLabel}>EATEN</Text>
              <Text style={s.bcValue}>{consumed.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <GlassCard style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: 8 }}>
          <Text style={s.sectionTitle}>MACROS</Text>
          <MacroBar label="Protein" grams={deficit.macroTotals.protein} maxGrams={200} color={colors.protein} />
          <MacroBar label="Carbs"   grams={deficit.macroTotals.carbs}   maxGrams={250} color={colors.carbs} />
          <MacroBar label="Fat"     grams={deficit.macroTotals.fats}    maxGrams={80}  color={colors.fat} />
          <MacroBar label="Fiber"   grams={deficit.macroTotals.fiber}   maxGrams={30}  color={colors.fiber} />
        </GlassCard>

        <View style={s.logHeader}>
          <Text style={s.sectionTitle}>TODAY'S LOG</Text>
          <Text style={s.logTotal}>{consumed.toLocaleString()} kcal</Text>
        </View>

        {logs.map((log: FoodLog) => (
          <GlassCard key={log.id} style={s.logItem}>
            <View style={s.logItemInner}>
              <View style={[s.logIcon, { backgroundColor: `${colors.primary}15` }]}>
                <View style={[s.logDot, { backgroundColor: colors.primary }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.logName}>{log.name}</Text>
                <Text style={s.logMeta}>P {log.protein}g · C {log.carbs}g · F {log.fats}g · Fi {log.fiber}g</Text>
              </View>
              <Text style={s.logKcal}>{log.calories}</Text>
            </View>
          </GlassCard>
        ))}

        {logs.length === 0 && !whoopLoading && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ fontFamily: fonts.label, color: colors.textDim, fontSize: 13 }}>
              No food logged yet. Tap + to add.
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <Pressable
        style={({ pressed }) => [s.fab, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        onPress={async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          openSheet()
        }}
        accessibilityLabel="Add food"
      >
        <Text style={s.fabIcon}>+</Text>
      </Pressable>

      <AddFoodSheet ref={sheetRef} />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  day: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  date: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, letterSpacing: 1.5, marginTop: 2 },
  ringWrap: { alignItems: 'center', paddingBottom: spacing.lg },
  burnConsumed: { flexDirection: 'row', gap: 24, marginTop: spacing.sm },
  bcItem: { alignItems: 'center' },
  bcLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5, textTransform: 'uppercase' },
  bcValue: { fontFamily: fonts.mono, fontSize: 20, color: colors.text, marginTop: 2 },
  divider: { width: 1, backgroundColor: colors.cardBorder, marginVertical: 4 },
  sectionTitle: { fontFamily: fonts.labelSemiBold, fontSize: 9, color: colors.textDim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  logTotal: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  logItem: { marginHorizontal: spacing.md, marginBottom: 5, padding: 10 },
  logItemInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  logMeta: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, marginTop: 1 },
  logKcal: { fontFamily: fonts.mono, fontSize: 13, color: colors.primary },
  fab: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12,
  },
  fabIcon: { fontFamily: fonts.body, fontSize: 26, color: colors.bg, lineHeight: 30 },
})
