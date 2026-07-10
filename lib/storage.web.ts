/**
 * Web implementation of lib/storage.ts, backed by localStorage so sessions
 * survive PWA restarts. Guarded for environments without localStorage
 * (SSR/static export rendering).
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
