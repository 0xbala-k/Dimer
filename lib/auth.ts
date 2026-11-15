import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { storage } from './storage'
import { getValidAccessToken } from './whoop'

/**
 * Ensures a Supabase auth session exists, signing in anonymously if needed.
 * The anon session is what makes `auth.uid()` non-null so RLS policies pass.
 * The session persists across launches via the SecureStore adapter in supabase.ts.
 * Returns the current auth user id.
 */
export async function ensureSession(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) {
    throw new Error(`anon sign-in failed: ${error?.message ?? 'no user returned'}`)
  }
  return data.user.id
}

/**
 * Makes sure the current session has a `users` row, which food_logs.user_id and
 * daily_summaries.user_id reference. Without it every food insert fails with a
 * foreign-key violation (Postgres 23503). A session that hasn't linked Whoop
 * yet (e.g. a newly installed PWA) would otherwise never be able to save.
 *
 * Inserts { id, whoop_user_id: id } only if no row exists yet (ON CONFLICT DO
 * NOTHING), so an existing row's real Whoop id is never overwritten. This
 * placeholder row is what linkWhoopAccount later merges into the Whoop
 * account. Returns the user id.
 */
export async function ensureUserRow(): Promise<string> {
  const userId = await ensureSession()
  const { error } = await supabase
    .from('users')
    .upsert({ id: userId, whoop_user_id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
  return userId
}

const LINKED_UID_KEY = 'dimer_linked_uid'

export type LinkResult = 'claimed' | 'already_linked' | 'switched'

/** Thrown when linking fails; `code` is the whoop-signin error code. */
export class LinkWhoopError extends Error {
  constructor(public code: string) {
    super(`whoop link failed: ${code}`)
    this.name = 'LinkWhoopError'
  }
}

/** True if this device's current session was already linked to its Whoop account. */
export async function isWhoopLinked(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return false
  return (await storage.getItem(LINKED_UID_KEY)) === session.user.id
}

/**
 * Makes this device use the one Dimer account that belongs to its Whoop user.
 *
 * The whoop-signin edge function verifies the Whoop token with Whoop (the
 * client never says which Whoop user it is) and then either:
 * - claims: no account exists yet, so this session becomes it;
 * - already_linked: this session is the account;
 * - switch: another session is the account. Anything this device logged while
 *   anonymous is moved into it, and the function returns a one-time sign-in
 *   token that this device redeems to become that account.
 */
async function invokeWhoopSignin(accessToken: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('whoop-signin', {
    body: { access_token: accessToken },
  })
  if (error) throw new LinkWhoopError('unreachable')
  return data
}

export async function linkWhoopAccount(): Promise<LinkResult> {
  const accessToken = await getValidAccessToken()
  if (!accessToken) throw new LinkWhoopError('no_whoop_token')
  await ensureSession()

  let data = await invokeWhoopSignin(accessToken)
  if (data?.error === 'not_signed_in') {
    // The stored session's user no longer exists (e.g. an earlier link merged
    // and removed it, but redeeming the sign-in token failed). Start a fresh
    // anonymous session and try once more.
    await supabase.auth.signOut({ scope: 'local' })
    await ensureSession()
    data = await invokeWhoopSignin(accessToken)
  }
  if (!data || typeof data.result !== 'string') throw new LinkWhoopError(String(data?.error ?? 'server_error'))

  let result: LinkResult
  if (data.result === 'switch') {
    if (typeof data.token_hash !== 'string') throw new LinkWhoopError('server_error')
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: data.token_hash,
      type: (data.verification_type as EmailOtpType | undefined) ?? 'magiclink',
    })
    if (verifyError) throw new LinkWhoopError('signin_failed')
    result = 'switched'
  } else if (data.result === 'claimed' || data.result === 'already_linked') {
    result = data.result
  } else {
    throw new LinkWhoopError('server_error')
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) await storage.setItem(LINKED_UID_KEY, session.user.id)
  return result
}
