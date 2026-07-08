import { supabase } from './supabase'
import { fetchWhoopUserId } from './whoop'

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
 * Creates/updates the `users` row for the current session, keyed by auth.uid().
 * food_logs.user_id and daily_summaries.user_id reference users(id), so this row
 * must exist before any food can be saved. Requires a valid Whoop session to read
 * the Whoop user id (the NOT NULL whoop_user_id column).
 */
export async function syncUserRow(): Promise<void> {
  const userId = await ensureSession()
  // Prefer the real Whoop id (needs the read:profile scope); fall back to the
  // auth id so the row — and the food_logs FK — still resolve without it.
  const whoopUserId = (await fetchWhoopUserId()) ?? userId

  const { error } = await supabase
    .from('users')
    .upsert({ id: userId, whoop_user_id: whoopUserId }, { onConflict: 'id' })
  if (error) console.error('[auth] syncUserRow failed:', error)
}
