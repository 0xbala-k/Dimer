// supabase/functions/food-analyze/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { parseAnalyzeInput, buildPhotoContent } from './logic.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `You are a nutrition analysis assistant. Return ONLY valid JSON, no markdown.

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
    const input = parseAnalyzeInput(await req.json())
    if (!input.ok) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    // description is user-controlled text: buildPhotoContent keeps it inside
    // the user turn, never the system prompt.
    const messages = input.mode === 'photo'
      ? [{ role: 'user', content: buildPhotoContent(input.images, input.description) }]
      : [{ role: 'user', content: `Analyze this food and return JSON: ${input.text}` }]
    // A multi-image meal (e.g. a bowl with several modifiers) has a longer
    // ingredient list; give it room so the JSON isn't cut off.
    const maxTokens = input.images.length > 1 ? 1024 : 512

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system: SYSTEM,
        messages,
      }),
    })
    const claudeJson = await claudeRes.json()
    const text = claudeJson.content?.[0]?.text ?? ''

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      // retry with prefilled assistant turn to force JSON output
      const retry = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          system: SYSTEM,
          messages: [...messages, { role: 'assistant', content: '{' }],
        }),
      })
      const retryJson = await retry.json()
      try {
        parsed = JSON.parse('{' + (retryJson.content?.[0]?.text ?? ''))
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
