import { View, Text, StyleSheet } from 'react-native'
import { colors, fonts } from '../lib/theme'

interface Props {
  strain: number | null
  recovery: number | null
}

export function WhoopBadge({ strain, recovery }: Props) {
  if (strain === null && recovery === null) return null
  return (
    <View style={s.row}>
      {strain !== null && (
        <View style={s.badge}>
          <View style={[s.dot, { backgroundColor: colors.primary }]} />
          <Text style={[s.text, { color: colors.primary }]}>{strain.toFixed(1)}</Text>
        </View>
      )}
      {recovery !== null && (
        <View style={s.badge}>
          <View style={[s.dot, { backgroundColor: colors.fiber }]} />
          <Text style={[s.text, { color: colors.fiber }]}>{Math.round(recovery)}%</Text>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: fonts.mono, fontSize: 11 },
})
