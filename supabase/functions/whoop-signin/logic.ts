// supabase/functions/whoop-signin/logic.ts
//
// Pure decision logic for whoop-signin, kept free of Deno and network code so
// the app's jest suite can test it (see __tests__/whoopSignin.test.ts).

/** The Dimer account that owns a Whoop user is identified by this address.
 * `.invalid` is a reserved TLD (RFC 2606): it can never receive mail, and
 * Dimer never sends any. Supabase needs an email to mint a one-time sign-in. */
export function syntheticEmail(whoopUserId: string): string {
  return `whoop-${whoopUserId}@users.dimer.invalid`
}

/** Whoop user ids are numeric; anything else is rejected before use. */
export function parseWhoopUserId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value)) return value
  return null
}

export interface LinkInput {
  /** auth.uid() of the session that called the function. */
  callerId: string
  callerIsAnonymous: boolean
  /** The caller's public.users.whoop_user_id, or null if it has no row. */
  callerWhoopUserId: string | null
  /** Verified Whoop user id (from Whoop's API, never from the client). */
  whoopUserId: string
  /** public.users.id that already holds whoopUserId, if any. */
  ownerId: string | null
}

export type LinkPlan =
  /** The caller's session already is the account. */
  | { kind: 'already_linked' }
  /** No account exists for this Whoop user: the caller's session becomes it. */
  | { kind: 'claim' }
  /** No account exists, but the caller is linked to a different Whoop user:
   * create a fresh account and switch the device to it (no merge). */
  | { kind: 'create_and_switch' }
  /** An account exists: switch the device to it, first moving the caller's
   * data in when mergeFrom is set. */
  | { kind: 'switch'; ownerId: string; mergeFrom: string | null }

/**
 * Decides what linking a device to a Whoop user should do.
 *
 * The caller's own data is merged into the existing account only when the
 * caller is an anonymous session that is not linked to a Whoop user yet,
 * i.e. it has no users row or only the placeholder row (whoop_user_id equal
 * to its own id) that saving food creates. A session that belongs to another
 * Whoop user is never merged or overwritten.
 */
export function planLink(input: LinkInput): LinkPlan {
  const { callerId, callerIsAnonymous, callerWhoopUserId, whoopUserId, ownerId } = input
  const callerLinked = callerWhoopUserId !== null && callerWhoopUserId !== callerId

  if (ownerId === callerId) return { kind: 'already_linked' }
  if (ownerId !== null) {
    const mergeFrom = callerIsAnonymous && !callerLinked ? callerId : null
    return { kind: 'switch', ownerId, mergeFrom }
  }
  // No account holds this Whoop user yet.
  if (callerLinked && callerWhoopUserId !== whoopUserId) return { kind: 'create_and_switch' }
  return { kind: 'claim' }
}
