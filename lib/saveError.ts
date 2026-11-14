/**
 * Turns a failed food-log save into a short, friendly reason for the alert.
 *
 * Supabase/PostgREST errors carry a Postgres SQLSTATE or PGRST code in `code`;
 * network failures surface as a TypeError ("Failed to fetch" in Chrome,
 * "Load failed" in Safari), sometimes wrapped in a PostgREST error message.
 */
export function saveErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; status?: unknown }
  const code = typeof e.code === 'string' ? e.code : ''
  const message = typeof e.message === 'string' ? e.message : ''

  if (/failed to fetch|load failed|network ?error|networkrequestfailed|timeout/i.test(message)) {
    return "Couldn't reach the server. Check your connection and try again."
  }
  if (/anon sign-in failed/i.test(message)) {
    return "Couldn't start a session. Close and reopen the app, then try again."
  }

  switch (code) {
    case '23503': // foreign_key_violation: the session has no users row
      return "Your account isn't set up yet. Close and reopen the app, then try again."
    case '42501': // insufficient_privilege, e.g. a row-level security rejection
      return "You're not allowed to save this entry. Try signing in again."
    case '23514': // check_violation
    case '23502': // not_null_violation
      return "Some of the details aren't valid. Check them and try again."
    case '22P02': // invalid_text_representation
    case '22003': // numeric_value_out_of_range
      return "One of the numbers isn't valid. Check the values and try again."
    case 'PGRST301': // JWT expired / invalid
    case 'PGRST302':
      return 'Your session expired. Close and reopen the app, then try again.'
  }

  const detail = code || message.slice(0, 80)
  return detail ? `Something went wrong (${detail}). Please try again.` : 'Something went wrong. Please try again.'
}
