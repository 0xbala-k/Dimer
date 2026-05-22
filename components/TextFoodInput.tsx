import { View, Text } from 'react-native'
import { colors, fonts } from '../lib/theme'
import type { FoodResult } from '../lib/types'
export function TextFoodInput({ onResult: _ }: { onResult: (r: FoodResult) => void }) {
  return <View style={{ padding: 20 }}><Text style={{ fontFamily: fonts.label, color: colors.textDim }}>Text input — coming in Task 15</Text></View>
}
