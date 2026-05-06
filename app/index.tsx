import { Redirect } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { getValidAccessToken } from '../lib/whoop'
import { colors } from '../lib/theme'

export default function Index() {
  const [dest, setDest] = useState<'/(tabs)/dashboard' | '/login' | null>(null)

  useEffect(() => {
    getValidAccessToken().then((token) => {
      setDest(token ? '/(tabs)/dashboard' : '/login')
    })
  }, [])

  if (!dest) return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  return <Redirect href={dest} />
}
