import { useState } from 'react'
import { View, TextInput, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { searchRestaurant, getRestaurantItem } from '../lib/api'
import { colors, fonts, radii } from '../lib/theme'
import { GlassCard } from './GlassCard'
import type { FoodResult, RestaurantResult } from '../lib/types'

interface Props {
  onResult: (result: FoodResult) => void
}

export function RestaurantSearch({ onResult }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RestaurantResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const items = await searchRestaurant(query.trim())
      setResults(items)
    } catch (e) {
      if (String(e).includes('quota_exceeded')) {
        Alert.alert('Daily limit reached', 'Spoonacular free tier: 150 searches/day. Try tomorrow or use text entry.')
      } else {
        Alert.alert('Search failed', 'Check your connection and try again.')
      }
    } finally {
      setSearching(false)
    }
  }

  async function handleSelect(item: RestaurantResult) {
    setSelecting(item.id)
    try {
      const detail = await getRestaurantItem(item.id)
      onResult({ ...detail, name: item.name })
    } catch {
      // Fall back to search result data
      onResult({
        name: item.name,
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fats: item.fats,
        fiber: item.fiber,
        ingredients: [],
        source: 'spoonacular',
        confidence: 'high',
      })
    } finally {
      setSelecting(null)
    }
  }

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. McDonald's Big Mac"
          placeholderTextColor={colors.textDim}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
        />
        <Pressable style={({ pressed }) => [s.searchBtn, pressed && { opacity: 0.85 }]} onPress={handleSearch}>
          {searching ? <ActivityIndicator color={colors.bg} size="small" /> : <Text style={s.searchBtnText}>Go</Text>}
        </Pressable>
      </View>

      {results.map((item) => (
        <GlassCard key={item.id} style={s.resultCard}>
          <Pressable onPress={() => handleSelect(item)} disabled={selecting === item.id} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <View style={s.resultHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.resultName}>{item.name}</Text>
                {item.restaurant ? <Text style={s.resultRest}>{item.restaurant}</Text> : null}
              </View>
              {selecting === item.id
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={s.resultKcal}>{item.calories} kcal</Text>
              }
            </View>
            <Text style={s.resultMacros}>P {item.protein}g · C {item.carbs}g · F {item.fats}g · Fi {item.fiber}g</Text>
          </Pressable>
        </GlassCard>
      ))}

      {results.length === 0 && !searching && query.length > 0 && (
        <Text style={s.empty}>No results. Try a different search term.</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { gap: 8 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 13, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  searchBtn: { backgroundColor: colors.primary, borderRadius: radii.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontFamily: fonts.labelSemiBold, fontSize: 13, color: colors.bg },
  resultCard: { padding: 12 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  resultName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  resultRest: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim, marginTop: 1 },
  resultKcal: { fontFamily: fonts.mono, fontSize: 14, color: colors.primary },
  resultMacros: { fontFamily: fonts.label, fontSize: 10, color: colors.textDim },
  empty: { fontFamily: fonts.label, fontSize: 12, color: colors.textDim, textAlign: 'center', paddingVertical: 16 },
})
