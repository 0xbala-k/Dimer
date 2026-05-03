export interface Ingredient {
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}

export interface FoodResult {
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
  ingredients: Ingredient[]
  source: 'calai' | 'claude' | 'openfoodfacts' | 'spoonacular'
  confidence?: 'high' | 'medium' | 'low'
  notes?: string
}

export interface FoodLog {
  id: string
  user_id: string
  logged_at: string
  date: string
  source: 'photo' | 'text' | 'restaurant' | 'barcode'
  name: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
  raw_response?: Record<string, unknown>
  notes?: string
}

export interface DailySummary {
  id: string
  user_id: string
  date: string
  calories_burned: number
  calories_consumed: number
  whoop_strain: number | null
  whoop_recovery: number | null
  updated_at: string
}

export interface MacroTotals {
  protein: number
  carbs: number
  fats: number
  fiber: number
}

export interface DeficitState {
  deficit: number
  pct: number
  isDeficit: boolean
  macroTotals: MacroTotals
}

export interface WhoopData {
  burned: number
  strain: number | null
  recovery: number | null
}

export interface RestaurantResult {
  id: number
  name: string
  restaurant: string
  calories: number
  protein: number
  carbs: number
  fats: number
  fiber: number
}
