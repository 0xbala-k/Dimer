import { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { GlassCard } from '../../../components/GlassCard'
import { useHistory } from '../../../hooks/useHistory'
import { periodRange, shiftAnchor, type Period } from '../../../lib/days'
import { localDateString } from '../../../lib/date'
import { rangeHeader, rowLabel, amountText, statusTag, totalLine, visibleDays } from '../../../lib/historyFormat'
import { colors, fonts, spacing, radii } from '../../../lib/theme'

export default function HistoryScreen() {
  const [period, setPeriod] = useState<Period>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const { days, total, loading, error, refresh } = useHistory(period, anchor)
  const [refreshing, setRefreshing] = useState(false)

  const { from, to } = periodRange(period, anchor)
  const today = localDateString()
  const atCurrent = from <= today && today <= to
  const rows = visibleDays(days)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={s.header}>
          <Text style={s.title}>History</Text>
          <View style={s.segment}>
            {(['week', 'month'] as Period[]).map((p) => (
              <Pressable
                key={p}
                style={[s.segBtn, period === p && s.segActive]}
                onPress={() => { setPeriod(p); setAnchor(new Date()) }}
                accessibilityRole="button"
                accessibilityState={{ selected: period === p }}
              >
                <Text style={[s.segText, period === p && s.segTextActive]}>{p === 'week' ? 'Week' : 'Month'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={s.nav}>
          <Pressable onPress={() => setAnchor(shiftAnchor(period, anchor, -1))} hitSlop={12} accessibilityLabel="Previous period">
            <Text style={s.chev}>‹</Text>
          </Pressable>
          <Text style={s.range}>{rangeHeader(period, from, to)}</Text>
          <Pressable
            onPress={() => !atCurrent && setAnchor(shiftAnchor(period, anchor, 1))}
            disabled={atCurrent}
            hitSlop={12}
            accessibilityLabel="Next period"
          >
            <Text style={[s.chev, atCurrent && s.chevOff]}>›</Text>
          </Pressable>
        </View>

        <Text style={s.total}>{totalLine(total)}</Text>

        {error && (
          <GlassCard style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
            <Pressable onPress={onRefresh}><Text style={s.retry}>Retry</Text></Pressable>
          </GlassCard>
        )}

        {rows.map((d) => {
          const tag = statusTag(d.status)
          const color = d.net === null ? colors.textMuted : d.net >= 0 ? colors.primary : colors.danger
          return (
            <Pressable key={d.key} onPress={() => router.push(`/history/${d.key}`)} accessibilityRole="button">
              <GlassCard style={s.row}>
                <Text style={s.rowLabel}>{rowLabel(d.label)}</Text>
                <Text style={s.tag}>{tag ?? ''}</Text>
                <Text style={[s.amount, { color }]}>{amountText(d)}</Text>
              </GlassCard>
            </Pressable>
          )
        })}

        {rows.length === 0 && !loading && !error && (
          <View style={s.empty}>
            <Text style={s.emptyText}>Nothing in this period.</Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { paddingTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.full, padding: 2 },
  segBtn: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: radii.full },
  segActive: { backgroundColor: colors.primary },
  segText: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.textMuted },
  segTextActive: { color: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, paddingBottom: spacing.sm },
  chev: { fontFamily: fonts.body, fontSize: 28, color: colors.text, paddingHorizontal: 8 },
  chevOff: { opacity: 0.2 },
  range: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text, minWidth: 130, textAlign: 'center' },
  total: { fontFamily: fonts.mono, fontSize: 12, color: colors.text, textAlign: 'center', paddingBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: 5, padding: 12, gap: 10 },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, width: 64 },
  tag: { flex: 1, fontFamily: fonts.label, fontSize: 10, color: colors.textMuted },
  amount: { fontFamily: fonts.mono, fontSize: 14 },
  errorCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, gap: 6, borderColor: colors.danger },
  errorText: { fontFamily: fonts.label, fontSize: 12, color: colors.danger },
  retry: { fontFamily: fonts.labelSemiBold, fontSize: 11, color: colors.primary },
  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontFamily: fonts.label, color: colors.textDim, fontSize: 13 },
})
