import React, { forwardRef, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { haptics } from '../lib/haptics'
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { colors, fonts, radii } from '../lib/theme'
import { PhotoInput } from './PhotoInput'
import { TextFoodInput } from './TextFoodInput'
import { RestaurantSearch } from './RestaurantSearch'
import { BarcodeInput } from './BarcodeInput'
import type { FoodResult } from '../lib/types'
import { ConfirmFoodCard } from './ConfirmFoodCard'

type Tab = 'photo' | 'text' | 'restaurant' | 'barcode'

const TABS: { id: Tab; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'text', label: 'Text' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'barcode', label: 'Barcode' },
]

export const AddFoodSheet = forwardRef<BottomSheet>((_, ref) => {
  const [activeTab, setActiveTab] = useState<Tab>('photo')
  const [pendingResult, setPendingResult] = useState<FoodResult | null>(null)

  const handleResult = useCallback((result: FoodResult) => {
    setPendingResult(result)
  }, [])

  const handleClose = useCallback(() => {
    setPendingResult(null)
    ;(ref as React.RefObject<BottomSheet>).current?.close()
  }, [ref])

  const handleSaved = useCallback(() => {
    setPendingResult(null)
    ;(ref as React.RefObject<BottomSheet>).current?.close()
  }, [ref])

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={['75%', '92%']}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: colors.sheet }}
      handleIndicatorStyle={{ backgroundColor: colors.cardBorder, width: 36 }}
    >
      <BottomSheetScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Log Food</Text>

        {pendingResult ? (
          <ConfirmFoodCard
            result={pendingResult}
            inputMethod={activeTab}
            onSaved={handleSaved}
            onRetake={() => setPendingResult(null)}
          />
        ) : (
          <>
            {/* Tab bar */}
            <View style={s.tabBar}>
              {TABS.map((tab) => (
                <Pressable
                  key={tab.id}
                  style={[s.tab, activeTab === tab.id && s.tabActive]}
                  onPress={() => {
                    haptics.selection()
                    setActiveTab(tab.id)
                  }}
                  accessibilityLabel={tab.label}
                >
                  <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Tab content */}
            {activeTab === 'photo' && <PhotoInput onResult={handleResult} />}
            {activeTab === 'text' && <TextFoodInput onResult={handleResult} />}
            {activeTab === 'restaurant' && <RestaurantSearch onResult={handleResult} />}
            {activeTab === 'barcode' && <BarcodeInput onResult={handleResult} />}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  )
})

AddFoodSheet.displayName = 'AddFoodSheet'

const s = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 32 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, textAlign: 'center', paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.sheetBorder, marginBottom: 12 },
  tabBar: { flexDirection: 'row', backgroundColor: `${colors.primary}08`, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 3, gap: 2, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: `${colors.primary}15`, borderWidth: 1, borderColor: `${colors.primary}20` },
  tabText: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabTextActive: { color: colors.primary },
})
