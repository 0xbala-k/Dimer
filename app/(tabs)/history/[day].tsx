import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { GlassCard } from '../../../components/GlassCard'
import { MacroBar } from '../../../components/MacroBar'
import { FoodLogItem } from '../../../components/FoodLogItem'
import { useDay } from '../../../hooks/useHistory'
import { amountText } from '../../../lib/historyFormat'
import { colors, fonts, spacing } from '../../../lib/theme'

function parseLabel(label: string): Date {
  const [y, m, d] = label.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DayScreen() {
  const { day: key } = useLocalSearchParams<{ day: string }>()
  const { day, loading, error } = useDay(String(key))

  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/history'))} hitSlop={12} accessibilityLabel="Back">
      <Text style={s.back}>‹ History</Text>
    </Pressable>
  )

  if (!day) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.topBar}>{back}</View>
        <View style={s.center}>
          <Text style={s.muted}>{loading ? 'Loading…' : error ?? 'Day not found.'}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const date = parseLabel(day.label)
  const net = day.net
  const diffColor = net === null ? colors.text : net >= 0 ? colors.primary : colors.danger
  const strain = day.cycle?.strain

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>{back}</View>
        <View style={s.header}>
          <Text style={s.title}>{date.toLocaleDateString('en-US', { weekday: 'long' })}</Text>
          <Text style={s.date}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</Text>
        </View>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statLabel}>BURNED</Text>
            <Text style={s.statValue}>{day.burned === null ? '—' : day.burned.toLocaleString()}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={s.statLabel}>EATEN</Text>
            <Text style={s.statValue}>{day.eaten.toLocaleString()}</Text>
          </View>
        </View>
        <Text style={[s.diff, { color: diffColor }]}>
          {net === null ? '—' : amountText(day)}
        </Text>
        {strain != null && <Text style={s.strain}>STRAIN {strain.toFixed(1)}</Text>}

        <GlassCard style={{ marginHorizontal: spacing.lg, marginVertical: spacing.md, gap: 8 }}>
          <Text style={s.sectionTitle}>MACROS</Text>
          <MacroBar label="Protein" grams={day.macros.protein} maxGrams={200} color={colors.protein} />
          <MacroBar label="Carbs" grams={day.macros.carbs} maxGrams={250} color={colors.carbs} />
          <MacroBar label="Fat" grams={day.macros.fats} maxGrams={80} color={colors.fat} />
          <MacroBar label="Fiber" grams={day.macros.fiber} maxGrams={30} color={colors.fiber} />
        </GlassCard>

        <View style={s.logHeader}>
          <Text style={s.sectionTitle}>FOOD</Text>
          <Text style={s.logTotal}>{day.eaten.toLocaleString()} kcal</Text>
        </View>
        {day.logs.map((l) => <FoodLogItem key={l.id} log={l} />)}
        {day.logs.length === 0 && (
          <View style={s.center}><Text style={s.muted}>No food logged.</Text></View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 8 },
  topBar: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  back: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary },
  center: { alignItems: 'center', paddingVertical: 32 },
  muted: { fontFamily: fonts.label, fontSize: 13, color: colors.textDim },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  date: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, letterSpacing: 1.5, marginTop: 2 },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  stat: { alignItems: 'center' },
  statLabel: { fontFamily: fonts.label, fontSize: 9, color: colors.textDim, letterSpacing: 1.5 },
  statValue: { fontFamily: fonts.mono, fontSize: 22, color: colors.text, marginTop: 2 },
  divider: { width: 1, backgroundColor: colors.cardBorder, marginVertical: 4 },
  diff: { fontFamily: fonts.mono, fontSize: 18, textAlign: 'center', marginTop: spacing.md },
  strain: { fontFamily: fonts.label, fontSize: 10, color: colors.textMuted, letterSpacing: 1.5, textAlign: 'center', marginTop: 4 },
  sectionTitle: { fontFamily: fonts.labelSemiBold, fontSize: 9, color: colors.textDim, letterSpacing: 2, marginBottom: 4 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  logTotal: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
})
