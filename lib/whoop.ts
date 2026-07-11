import { storage } from './storage'
import type { WhoopData } from './types'

const WHOOP_CLIENT_ID = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID!
export const DISCOVERY = {
  authorizationEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/token',
}

const KEYS = {
  accessToken: 'whoop_access_token',
  refreshToken: 'whoop_refresh_token',
  expiresAt: 'whoop_expires_at',
  userId: 'whoop_user_id',
}

export async function saveWhoopTokens(params: {
  access_token: string
  refresh_token: string
  expires_in: number
}) {
  const expiresAt = Date.now() + params.expires_in * 1000
  await Promise.all([
    storage.setItem(KEYS.accessToken, params.access_token),
    storage.setItem(KEYS.refreshToken, params.refresh_token),
    storage.setItem(KEYS.expiresAt, String(expiresAt)),
  ])
}

export async function clearWhoopTokens() {
  await Promise.all([
    storage.removeItem(KEYS.accessToken),
    storage.removeItem(KEYS.refreshToken),
    storage.removeItem(KEYS.expiresAt),
    storage.removeItem(KEYS.userId),
  ])
}

/**
 * Returns the Whoop user id (as a string), fetching the basic profile once and
 * caching it in storage. Used as the NOT NULL whoop_user_id on the users row.
 */
export async function fetchWhoopUserId(): Promise<string | null> {
  const cached = await storage.getItem(KEYS.userId)
  if (cached) return cached
  try {
    const res = await whoopFetch('/user/profile/basic')
    if (!res.ok) return null
    const data = await res.json()
    const id = data?.user_id != null ? String(data.user_id) : null
    if (id) await storage.setItem(KEYS.userId, id)
    return id
  } catch {
    return null
  }
}

let _authCheckPromise: Promise<string | null> | null = null

async function _getValidAccessToken(): Promise<string | null> {
  const [token, refreshToken, expiresAtStr] = await Promise.all([
    storage.getItem(KEYS.accessToken),
    storage.getItem(KEYS.refreshToken),
    storage.getItem(KEYS.expiresAt),
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
    if (!data?.access_token) return null
    await saveWhoopTokens(data)
    return data.access_token
  } catch {
    return null
  }
}

export function getValidAccessToken(): Promise<string | null> {
  if (!_authCheckPromise) {
    _authCheckPromise = _getValidAccessToken().finally(() => {
      _authCheckPromise = null
    })
  }
  return _authCheckPromise
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

  const cycles: { score?: { kilojoule?: number; strain?: number } }[] = data.records ?? []

  const totalKj = cycles.reduce((sum, c) => sum + (c.score?.kilojoule ?? 0), 0)
  const burned = Math.round(totalKj / 4.184)

  const latest = cycles[cycles.length - 1]
  const strain = latest?.score?.strain ?? null

  return { burned, strain, recovery: null }
}
