import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated'
import { useEffect } from 'react'
import { colors, fonts } from '../lib/theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const SIZE = 180
const STROKE = 14
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface Props {
  burned: number
  consumed: number
}

export function DeficitRing({ burned, consumed }: Props) {
  const pct = burned === 0 ? 0 : Math.min(consumed / burned, 1.5)
  const dashOffset = useSharedValue(CIRCUMFERENCE)

  useEffect(() => {
    const targetOffset = CIRCUMFERENCE * (1 - Math.min(pct, 1))
    dashOffset.value = withTiming(targetOffset, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    })
  }, [pct])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }))

  const deficit = burned - consumed
  const isDeficit = deficit >= 0
  const isNearLimit = pct >= 0.9 && pct < 1.0
  const isSurplus = pct >= 1.0

  const ringStroke = isSurplus
    ? colors.ringSurplus
    : isNearLimit
    ? colors.ringAmber
    : 'url(#ice-grad)'

  const valueColor = isSurplus ? colors.ringSurplus : isNearLimit ? colors.ringAmber : colors.primary

  return (
    <View style={s.container}>
      <Svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Defs>
          <LinearGradient id="ice-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={colors.ring.from} />
            <Stop offset="100%" stopColor={colors.ring.to} />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          stroke={colors.cardBorder} strokeWidth={STROKE} fill="none"
        />
        {/* Fill */}
        <AnimatedCircle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          stroke={ringStroke} strokeWidth={STROKE} fill="none"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={animatedProps}
          strokeLinecap="round"
        />
      </Svg>
      <View style={s.label}>
        <Text style={[s.labelText, { color: colors.textDim }]}>
          {isDeficit ? 'DEFICIT' : 'SURPLUS'}
        </Text>
        <Text style={[s.value, { color: valueColor }]}>
          {Math.abs(deficit).toLocaleString()}
        </Text>
        <Text style={[s.unit, { color: colors.textDim }]}>kcal</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', alignItems: 'center', gap: 2 },
  labelText: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' },
  value: { fontFamily: fonts.mono, fontSize: 32, lineHeight: 36 },
  unit: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1 },
})
