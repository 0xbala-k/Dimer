// supabase/functions/whoop-proxy/index.ts
//
// Browser-side fetches to api.prod.whoop.com fail because Whoop sends no CORS
// headers, so the web app routes its OAuth token exchange and API reads
// through this function. It also keeps the Whoop client secret server-side
// instead of shipping it in the public JS bundle.
//
// Always responds 200 with { status, body } so the client can inspect Whoop's
// real status code (supabase-js treats non-2xx as an opaque invoke error).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TOKEN_ENDPOINT = 'https://api.prod.whoop.com/oauth/oauth2/token'
// WHOOP retired the v1 developer API (support ended Oct 1, 2025); the current
// OpenAPI spec only serves v2. Cycle and basic-profile shapes are unchanged.
const API_BASE = 'https://api.prod.whoop.com/developer/v2'
const TOKEN_PARAMS = ['grant_type', 'code', 'redirect_uri', 'code_verifier', 'refresh_token']

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { action, params, path, access_token } = await req.json() as {
      action?: string
      params?: Record<string, unknown>
      path?: string
      access_token?: string
    }

    if (action === 'token') {
      const form = new URLSearchParams()
      for (const key of TOKEN_PARAMS) {
        const value = params?.[key]
        if (typeof value === 'string') form.set(key, value)
      }
      // WHOOP's refresh example sends scope=offline so the response carries a
      // new refresh token (WHOOP rotates it on every refresh).
      if (form.get('grant_type') === 'refresh_token' && !form.has('scope')) {
        form.set('scope', 'offline')
      }
      const clientId = Deno.env.get('WHOOP_CLIENT_ID')
      const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET')
      if (!clientId || !clientSecret) {
        // Surface missing secrets instead of sending blanks to WHOOP and
        // getting an opaque invalid_client back.
        return json({ status: 500, body: { error: 'missing_whoop_secrets' } })
      }
      form.set('client_id', clientId)
      form.set('client_secret', clientSecret)

      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
      return json({ status: res.status, body: await parseBody(res) })
    }

    if (action === 'api') {
      if (
        typeof path !== 'string' ||
        !path.startsWith('/') ||
        path.includes('..') ||
        typeof access_token !== 'string'
      ) {
        return json({ error: 'invalid_input' }, 400)
      }
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      return json({ status: res.status, body: await parseBody(res) })
    }

    return json({ error: 'invalid_input' }, 400)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
