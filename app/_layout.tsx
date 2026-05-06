import 'react-native-url-polyfill/auto'
import 'react-native-gesture-handler'
import '../global.css'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import * as WebBrowser from 'expo-web-browser'
import { useFonts, Syne_800ExtraBold } from '@expo-google-fonts/syne'
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono'
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans'
import { Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'
import { getValidAccessToken } from '../lib/whoop'
import { colors } from '../lib/theme'
import { View } from 'react-native'

WebBrowser.maybeCompleteAuthSession()
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [authChecked, setAuthChecked] = useState(false)
  const [hasToken, setHasToken] = useState(false)

  const [fontsLoaded] = useFonts({
    Syne_800ExtraBold,
    DMMono_400Regular,
    DMMono_500Medium,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    Inter_500Medium,
    Inter_600SemiBold,
  })

  useEffect(() => {
    getValidAccessToken().then((token) => {
      setHasToken(!!token)
      setAuthChecked(true)
    })
  }, [])

  useEffect(() => {
    if (fontsLoaded && authChecked) SplashScreen.hideAsync()
  }, [fontsLoaded, authChecked])

  if (!fontsLoaded || !authChecked) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
