import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, fonts } from '../../../lib/theme'

export default function HistoryScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.textMuted }}>
          Coming Soon
        </Text>
        <Text style={{ fontFamily: fonts.label, fontSize: 13, color: colors.textDim }}>
          Historical trends in a future update
        </Text>
      </View>
    </SafeAreaView>
  )
}
