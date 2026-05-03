import * as SecureStore from 'expo-secure-store'
import * as AuthSession from 'expo-auth-session'
import type { WhoopData } from './types'

const WHOOP_CLIENT_ID = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID!
const DISCOVERY = {
  authorizationEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/token',
}

export const WHOOP_SCOPES = ['offline', 'read:recovery', 'read:cycles', 'read:workout', 'read:sleep', 'read:profile']

export function makeWhoopRedirectUri() {
  return AuthSession.makeRedirectUri({ scheme: 'dimer', path: 'auth/callback' })
}

export function getWhoopDiscovery() {
  return DISCOVERY
}

const KEYS = {
  accessToken: 'whoop_access_token',
  refreshToken: 'whoop_refresh_token',
  expiresAt: 'whoop_expires_at',
}

export async function saveWhoopTokens(params: {
  access_token: string
  refresh_token: string
  expires_in: number
}) {
  const expiresAt = Date.now() + params.expires_in * 1000
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, params.access_token),
    SecureStore.setItemAsync(KEYS.refreshToken, params.refresh_token),
    SecureStore.setItemAsync(KEYS.expiresAt, String(expiresAt)),
  ])
}

export async function clearWhoopTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.accessToken),
    SecureStore.deleteItemAsync(KEYS.refreshToken),
    SecureStore.deleteItemAsync(KEYS.expiresAt),
  ])
}

export async function getValidAccessToken(): Promise<string | null> {
  const [token, refreshToken, expiresAtStr] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.expiresAt),
  ])

  if (!token) return null

  const expiresAt = Number(expiresAtStr ?? '0')
  const fiveMinutes = 5 * 60 * 1000
  if (Date.now() < expiresAt - fiveMinutes) return token

  if (!refreshToken) return null
  try {
    const res = await fetch(DISCOVERY.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: WHOOP_CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    await saveWhoopTokens(data)
    return data.access_token
  } catch {
    return null
  }
}

async function whoopFetch(path: string): Promise<Response> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('no_token')
  return fetch(`https://api.prod.whoop.com/developer/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function fetchTodayWhoopData(): Promise<WhoopData> {
  const today = new Date().toISOString().split('T')[0]
  const start = `${today}T00:00:00.000Z`
  const end = `${today}T23:59:59.999Z`

  const res = await whoopFetch(`/cycle?start=${start}&end=${end}`)
  if (!res.ok) throw new Error(`Whoop API error: ${res.status}`)
  const data = await res.json()

  const cycles: { score?: { kilojoule?: number; strain?: number; recovery_score?: number } }[] = data.records ?? []

  const totalKj = cycles.reduce((sum, c) => sum + (c.score?.kilojoule ?? 0), 0)
  const burned = Math.round(totalKj / 4.184)

  const latest = cycles[cycles.length - 1]
  const strain = latest?.score?.strain ?? null
  const recovery = latest?.score?.recovery_score ?? null

  return { burned, strain, recovery }
}
