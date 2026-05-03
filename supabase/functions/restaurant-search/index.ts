// supabase/functions/restaurant-search/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { query, id } = await req.json() as { query?: string; id?: number }
    const key = Deno.env.get('SPOONACULAR_API_KEY') ?? ''

    if (typeof query === 'undefined' && typeof id === 'undefined') {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Fetch detail for a single item
    if (id !== undefined) {
      const res = await fetch(
        `https://api.spoonacular.com/food/menuItems/${id}?apiKey=${key}`
      )
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: 'quota_exceeded' }), {
          status: 402,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const item = await res.json()
      return new Response(JSON.stringify({
        id: item.id,
        name: item.title,
        calories: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Calories')?.amount ?? 0,
        protein: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Protein')?.amount ?? 0,
        carbs: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Carbohydrates')?.amount ?? 0,
        fats: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Fat')?.amount ?? 0,
        fiber: item.nutrition?.nutrients?.find((n: { name: string }) => n.name === 'Fiber')?.amount ?? 0,
        source: 'spoonacular',
        confidence: 'high' as const,
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Search
    const res = await fetch(
      `https://api.spoonacular.com/food/menuItems/search?query=${encodeURIComponent(query ?? '')}&number=10&apiKey=${key}`
    )
    if (res.status === 402) {
      return new Response(JSON.stringify({ error: 'quota_exceeded' }), {
        status: 402,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const data = await res.json()
    const results = (data.menuItems ?? []).map((item: {
      id: number
      title: string
      restaurantChain?: string
      nutrition?: { nutrients?: { name: string; amount: number }[] }
    }) => ({
      id: item.id,
      name: item.title,
      restaurant: item.restaurantChain ?? '',
      calories: item.nutrition?.nutrients?.find((n) => n.name === 'Calories')?.amount ?? 0,
      protein: item.nutrition?.nutrients?.find((n) => n.name === 'Protein')?.amount ?? 0,
      carbs: item.nutrition?.nutrients?.find((n) => n.name === 'Carbohydrates')?.amount ?? 0,
      fats: item.nutrition?.nutrients?.find((n) => n.name === 'Fat')?.amount ?? 0,
      fiber: item.nutrition?.nutrients?.find((n) => n.name === 'Fiber')?.amount ?? 0,
    }))

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
