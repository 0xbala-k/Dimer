// supabase/functions/food-analyze/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CLAUDE_SYSTEM = `You are a nutrition analysis assistant. Return ONLY valid JSON, no markdown.

Schema:
{
  "name": "short dish name",
  "calories": <kcal number>,
  "protein": <grams number>,
  "carbs": <grams number>,
  "fats": <grams number>,
  "fiber": <grams number>,
  "ingredients": [{ "name": "string", "calories": 0, "protein": 0, "carbs": 0, "fats": 0, "fiber": 0 }],
  "confidence": "high" | "medium" | "low",
  "notes": "any caveats"
}

Rules:
- All macros in grams. Calories in kcal. Fiber in grams (0 if unknown).
- If weight stated (e.g. "150g chicken"), use that weight.
- If no weight, use a typical single serving.
- If unrecognizable, return { "error": "unrecognized" }.
- Never refuse. Always estimate. Mark confidence low if uncertain.`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { mode, data } = await req.json() as { mode: 'photo' | 'text' | 'barcode', data: string }
    if (!['photo', 'text', 'barcode'].includes(mode) || typeof data !== 'string') {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const calaiKey = Deno.env.get('CALAI_API_KEY') ?? ''
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    // 1. Try Cal AI
    const endpoint = mode === 'photo'
      ? 'https://api.calai.app/v4/scanImage'
      : mode === 'text'
      ? 'https://api.calai.app/v4/describeMeal'
      : 'https://api.calai.app/v4/scanBarcode'

    const body = mode === 'photo' ? { data: { imageData: data } }
      : mode === 'text' ? { data: { text: data } }
      : { data: { barcodeData: data } }

    const calRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${calaiKey}` },
      body: JSON.stringify(body),
    })
    const calJson = await calRes.json()

    if (calJson.success && calJson.data) {
      const d = calJson.data
      return new Response(JSON.stringify({
        name: d.name ?? 'Unknown',
        calories: d.calories ?? 0,
        protein: d.protein ?? 0,
        carbs: d.carbs ?? 0,
        fats: d.fats ?? d.fat ?? 0,
        fiber: d.fiber ?? 0,
        ingredients: d.ingredients ?? [],
        source: 'calai',
        confidence: 'high',
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // 2. Barcode: no Claude fallback
    if (mode === 'barcode') {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // 3. Claude fallback (photo + text)
    const messages = mode === 'photo'
      ? [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: 'Analyze this food photo and return the JSON.' },
        ]}]
      : [{ role: 'user', content: `Analyze this food and return JSON: ${data}` }]

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: CLAUDE_SYSTEM,
        messages,
      }),
    })
    const claudeJson = await claudeRes.json()
    const text = claudeJson.content?.[0]?.text ?? ''

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      // retry with stricter prompt
      const retry = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: CLAUDE_SYSTEM,
          messages: [...messages, { role: 'assistant', content: 'Here is the JSON:' }],
        }),
      })
      const retryJson = await retry.json()
      try {
        parsed = JSON.parse(retryJson.content?.[0]?.text ?? '{}')
      } catch {
        return new Response(JSON.stringify({ error: 'parse_failed' }), {
          status: 422,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    if (parsed.error) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 422,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      name: parsed.name ?? 'Unknown',
      calories: Number(parsed.calories ?? 0),
      protein: Number(parsed.protein ?? 0),
      carbs: Number(parsed.carbs ?? 0),
      fats: Number(parsed.fats ?? 0),
      fiber: Number(parsed.fiber ?? 0),
      ingredients: (parsed.ingredients as unknown[]) ?? [],
      source: 'claude',
      confidence: parsed.confidence ?? 'low',
      notes: parsed.notes,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
