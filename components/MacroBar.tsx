import { View, Text, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useEffect } from 'react'
import { colors, fonts } from '../lib/theme'

interface Props {
  label: string
  grams: number
  maxGrams: number
  color: string
}

export function MacroBar({ label, grams, maxGrams, color }: Props) {
  const width = useSharedValue(0)

  useEffect(() => {
    const pct = maxGrams === 0 ? 0 : Math.min(grams / maxGrams, 1)
    width.value = withTiming(pct, { duration: 600 })
  }, [grams, maxGrams])

  const animStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }))

  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.track}>
        <Animated.View style={[s.fill, { backgroundColor: color }, animStyle]} />
      </View>
      <Text style={s.value}>{Math.round(grams)}g</Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: fonts.label, fontSize: 10, color: colors.textMuted, width: 50 },
  track: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  value: { fontFamily: fonts.mono, fontSize: 11, color: colors.text, width: 34, textAlign: 'right' },
})
