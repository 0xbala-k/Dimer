import { View, ViewStyle, StyleSheet } from 'react-native'
import { colors, radii } from '../lib/theme'

interface Props {
  children: React.ReactNode
  style?: ViewStyle
}

export function GlassCard({ children, style }: Props) {
  return <View style={[s.card, style]}>{children}</View>
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.lg,
    padding: 12,
  },
})
