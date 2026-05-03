import type { FoodResult } from './types'

interface OFFProduct {
  product_name?: string
  serving_size?: string
  nutriments?: {
    'energy-kcal_100g'?: number
    'energy-kcal_serving'?: number
    proteins_100g?: number
    carbohydrates_100g?: number
    fat_100g?: number
    fiber_100g?: number
  }
}

function parseServingGrams(servingSize: string | undefined): number | null {
  if (!servingSize) return null
  const match = servingSize.match(/([\d.]+)\s*g/i)
  return match ? parseFloat(match[1]) : null
}

export async function fetchByBarcode(barcode: string): Promise<FoodResult | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
  if (!res.ok) return null
  const json = await res.json()
  if (json.status !== 1 || !json.product) return null

  const product: OFFProduct = json.product
  const n = product.nutriments ?? {}
  const servingG = parseServingGrams(product.serving_size)

  let calories: number
  let protein: number
  let carbs: number
  let fats: number
  let fiber: number

  if (servingG && n['energy-kcal_100g'] !== undefined) {
    const ratio = servingG / 100
    calories = Math.round((n['energy-kcal_100g'] ?? 0) * ratio)
    protein = Math.round((n.proteins_100g ?? 0) * ratio * 10) / 10
    carbs = Math.round((n.carbohydrates_100g ?? 0) * ratio * 10) / 10
    fats = Math.round((n.fat_100g ?? 0) * ratio * 10) / 10
    fiber = Math.round((n.fiber_100g ?? 0) * ratio * 10) / 10
  } else if (n['energy-kcal_serving'] !== undefined) {
    calories = Math.round(n['energy-kcal_serving'])
    protein = Math.round((n.proteins_100g ?? 0) * 10) / 10
    carbs = Math.round((n.carbohydrates_100g ?? 0) * 10) / 10
    fats = Math.round((n.fat_100g ?? 0) * 10) / 10
    fiber = Math.round((n.fiber_100g ?? 0) * 10) / 10
  } else {
    calories = Math.round(n['energy-kcal_100g'] ?? 0)
    protein = n.proteins_100g ?? 0
    carbs = n.carbohydrates_100g ?? 0
    fats = n.fat_100g ?? 0
    fiber = n.fiber_100g ?? 0
  }

  return {
    name: product.product_name ?? 'Unknown Product',
    calories,
    protein,
    carbs,
    fats,
    fiber,
    ingredients: [],
    source: 'openfoodfacts',
    confidence: 'high',
    notes: servingG ? undefined : 'Nutrition data per 100g — serving size unknown',
  }
}
