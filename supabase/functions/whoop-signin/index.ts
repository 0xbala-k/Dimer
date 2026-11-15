// supabase/functions/whoop-signin/index.ts
//
// Makes the Whoop account the Dimer account. A device sends its Whoop access
// token; this function asks Whoop who that is (never trusting a client-sent
// id), finds the Dimer account that owns that Whoop user, and either links the
// calling session to it or returns a one-time sign-in token that switches the
// device into it. Data the device logged anonymously before linking is moved
// into the account first (public.merge_anonymous_account).
//
// Uses the service-role key, so it lives apart from the unprivileged
// whoop-proxy. verify_jwt stays on: callers must send their Supabase session.
//
// Always responds 200 with { result, ... } or { error } (supabase-js turns
// non-2xx into an opaque error). Never logs tokens.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.105.1'
import { planLink, parseWhoopUserId, syntheticEmail, type LinkPlan } from './logic.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const WHOOP_PROFILE_URL = 'https://api.prod.whoop.com/developer/v2/user/profile/basic'

// Untyped schema (no generated types in this repo).
type Admin = SupabaseClient

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: { ...CORS, 'Content-Type': 'application/json' } })
}

class LinkError extends Error {}

/** Asks Whoop which user this access token belongs to. */
async function verifiedWhoopUserId(accessToken: string): Promise<string | null> {
  const res = await fetch(WHOOP_PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const body = await res.json().catch(() => null)
  return parseWhoopUserId(body?.user_id)
}

async function findOwner(admin: Admin, whoopUserId: string): Promise<string | null> {
  const { data, error } = await admin.from('users').select('id').eq('whoop_user_id', whoopUserId).maybeSingle()
  if (error) throw new LinkError('lookup_failed')
  return (data?.id as string | undefined) ?? null
}

/** Gives the account its synthetic email (also makes an anonymous user permanent). */
async function ensureEmail(admin: Admin, userId: string, email: string): Promise<void> {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) throw new LinkError('account_missing')
  if (data.user.email === email) return
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
  if (updateError) {
    console.error('[whoop-signin] set email failed:', updateError.code ?? updateError.status)
    throw new LinkError('account_conflict')
  }
}

/** One-time sign-in token for the account with this email. No email is sent. */
async function signInToken(admin: Admin, email: string): Promise<{ token_hash: string; verification_type: string; userId: string }> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token || !data.user) {
    console.error('[whoop-signin] generateLink failed:', error?.code ?? error?.status)
    throw new LinkError('signin_failed')
  }
  return {
    token_hash: data.properties.hashed_token,
    verification_type: data.properties.verification_type ?? 'magiclink',
    userId: data.user.id,
  }
}

async function execute(
  admin: Admin,
  plan: LinkPlan,
  caller: { id: string },
  whoopUserId: string
): Promise<Record<string, unknown>> {
  const email = syntheticEmail(whoopUserId)

  switch (plan.kind) {
    case 'already_linked':
      await ensureEmail(admin, caller.id, email)
      return { result: 'already_linked' }

    case 'claim': {
      const { error } = await admin
        .from('users')
        .upsert({ id: caller.id, whoop_user_id: whoopUserId }, { onConflict: 'id' })
      if (error?.code === '23505') throw new LinkError('retry') // another device claimed it just now
      if (error) throw new LinkError('claim_failed')
      await ensureEmail(admin, caller.id, email)
      return { result: 'claimed' }
    }

    case 'create_and_switch': {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
      // If the auth user already exists (an earlier attempt stopped half way),
      // generateLink below still finds it by email.
      if (error && error.code !== 'email_exists') throw new LinkError('create_failed')
      const link = await signInToken(admin, email)
      const accountId = data?.user?.id ?? link.userId
      const { error: rowError } = await admin
        .from('users')
        .upsert({ id: accountId, whoop_user_id: whoopUserId }, { onConflict: 'id' })
      if (rowError?.code === '23505') throw new LinkError('retry')
      if (rowError) throw new LinkError('claim_failed')
      return { result: 'switch', token_hash: link.token_hash, verification_type: link.verification_type }
    }

    case 'switch': {
      await ensureEmail(admin, plan.ownerId, email)
      // Mint the token before touching data, so a failure leaves nothing half done.
      const link = await signInToken(admin, email)
      if (link.userId !== plan.ownerId) throw new LinkError('account_conflict')
      if (plan.mergeFrom) {
        const { error } = await admin.rpc('merge_anonymous_account', { p_from: plan.mergeFrom, p_to: plan.ownerId })
        if (error) {
          console.error('[whoop-signin] merge failed:', error.code)
          throw new LinkError('merge_failed')
        }
        // The anonymous user now owns nothing; remove it. Best effort.
        const { error: deleteError } = await admin.auth.admin.deleteUser(plan.mergeFrom)
        if (deleteError) console.error('[whoop-signin] delete merged user failed:', deleteError.code ?? deleteError.status)
      }
      return { result: 'switch', token_hash: link.token_hash, verification_type: link.verification_type }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'invalid_input' })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return json({ error: 'server_misconfigured' })
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    // 1. Who is calling? (verify_jwt already rejected invalid tokens.)
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data: callerData, error: callerError } = await admin.auth.getUser(jwt)
    const caller = callerData?.user
    if (callerError || !caller) return json({ error: 'not_signed_in' })

    // 2. Which Whoop user is this? Ask Whoop.
    const body = await req.json().catch(() => null)
    const accessToken = typeof body?.access_token === 'string' ? body.access_token : ''
    if (!accessToken) return json({ error: 'invalid_input' })
    const whoopUserId = await verifiedWhoopUserId(accessToken)
    if (!whoopUserId) return json({ error: 'whoop_unauthorized' })

    const { data: callerRow, error: rowError } = await admin
      .from('users')
      .select('whoop_user_id')
      .eq('id', caller.id)
      .maybeSingle()
    if (rowError) return json({ error: 'lookup_failed' })

    // 3. Decide and act. One retry covers two devices claiming at once.
    for (let attempt = 0; ; attempt++) {
      const plan = planLink({
        callerId: caller.id,
        callerIsAnonymous: caller.is_anonymous === true,
        callerWhoopUserId: (callerRow?.whoop_user_id as string | undefined) ?? null,
        whoopUserId,
        ownerId: await findOwner(admin, whoopUserId),
      })
      try {
        return json(await execute(admin, plan, caller, whoopUserId))
      } catch (e) {
        if (e instanceof LinkError && e.message === 'retry' && attempt === 0) continue
        throw e
      }
    }
  } catch (e) {
    if (e instanceof LinkError) return json({ error: e.message === 'retry' ? 'claim_failed' : e.message })
    console.error('[whoop-signin] unexpected error:', e instanceof Error ? e.name : typeof e)
    return json({ error: 'server_error' })
  }
})
