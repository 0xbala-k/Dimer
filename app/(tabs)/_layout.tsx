import { Tabs } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { colors, fonts } from '../../lib/theme'
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg'

function TodayIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Circle cx={12} cy={12} r={10} />
      <Path d="M12 6v6l4 2" strokeLinecap="round" />
    </Svg>
  )
}

function LogIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Line x1={8} y1={6} x2={21} y2={6} strokeLinecap="round" />
      <Line x1={8} y1={12} x2={21} y2={12} strokeLinecap="round" />
      <Line x1={8} y1={18} x2={21} y2={18} strokeLinecap="round" />
      <Line x1={3} y1={6} x2={3.01} y2={6} strokeLinecap="round" />
      <Line x1={3} y1={12} x2={3.01} y2={12} strokeLinecap="round" />
      <Line x1={3} y1={18} x2={3.01} y2={18} strokeLinecap="round" />
    </Svg>
  )
}

function HistoryIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(9,17,31,0.95)',
          borderTopColor: colors.cardBorder,
          borderTopWidth: 1,
          paddingBottom: 6,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.5 },
      }}
      screenListeners={{
        tabPress: () => { Haptics.selectionAsync() },
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{ title: 'Today', tabBarIcon: ({ color }) => <TodayIcon color={color} /> }}
      />
      <Tabs.Screen
        name="log/index"
        options={{ title: 'Log', tabBarIcon: ({ color }) => <LogIcon color={color} /> }}
      />
      <Tabs.Screen
        name="history/index"
        options={{ title: 'History', tabBarIcon: ({ color }) => <HistoryIcon color={color} /> }}
      />
    </Tabs>
  )
}
