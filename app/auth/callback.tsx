import { useEffect } from 'react'
import { View, Text } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { colors, fonts } from '../../lib/theme'

export default function AuthCallback() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession()
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fonts.label, color: colors.textMuted }}>Completing sign-in…</Text>
    </View>
  )
}
