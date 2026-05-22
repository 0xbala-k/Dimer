import { View, Text } from 'react-native'
import { colors, fonts } from '../lib/theme'
import type { FoodResult } from '../lib/types'
export function RestaurantSearch({ onResult: _ }: { onResult: (r: FoodResult) => void }) {
  return <View style={{ padding: 20 }}><Text style={{ fontFamily: fonts.label, color: colors.textDim }}>Restaurant search — coming in Task 16</Text></View>
}
