/**
 * Web implementation of lib/storage.ts, backed by localStorage so sessions
 * survive PWA restarts. Guarded for environments without localStorage
 * (SSR/static export rendering).
 *
 * Security tradeoff vs native SecureStore: localStorage is plaintext and
 * readable by any script on the origin, so an XSS could exfiltrate the Whoop
 * refresh token and Supabase session stored here. The web platform offers no
 * JS-accessible equivalent of the Keychain; moving token exchange/refresh
 * behind a backend with httpOnly cookies is the upgrade path if this ever
 * serves more than a personal deployment.
 */
export const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
  },
}
