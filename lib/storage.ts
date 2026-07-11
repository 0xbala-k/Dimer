import * as SecureStore from 'expo-secure-store'

/**
 * Async key-value storage for auth tokens. Native uses SecureStore
 * (Keychain/Keystore); web resolves to storage.web.ts (localStorage).
 */
export const storage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}
