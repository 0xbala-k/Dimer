import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFoodLog } from '../../../hooks/useFoodLog'
import { FoodLogItem } from '../../../components/FoodLogItem'
import { colors, fonts, spacing } from '../../../lib/theme'

export default function LogScreen() {
  const { logs, loading, totalCalories, refetch, deleteLog } = useFoodLog()

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Today's Log</Text>
        <Text style={s.total}>{totalCalories.toLocaleString()} kcal</Text>
      </View>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      >
        {logs.map((log) => (
          <FoodLogItem key={log.id} log={log} onDelete={deleteLog} />
        ))}
        {logs.length === 0 && !loading && (
          <View style={s.empty}>
            <Text style={s.emptyText}>No food logged today.</Text>
            <Text style={s.emptyHint}>Use the + button on the Dashboard to add.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  total: { fontFamily: fonts.mono, fontSize: 16, color: colors.primary },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textMuted },
  emptyHint: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim },
})
