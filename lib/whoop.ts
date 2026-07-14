import { storage } from './storage'
import { supabase } from './supabase'
import type { WhoopData } from './types'
import { summarizeCycles, type CycleRecord } from './whoopCycles'

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

/**
 * All Whoop traffic goes through the whoop-proxy edge function: Whoop sends
 * no CORS headers so the browser can't call it directly, and the proxy holds
 * the client secret server-side. It always responds 200 with Whoop's real
 * { status, body } tucked inside.
 */
async function whoopProxy(body: object): Promise<{ status: number; body: any } | null> {
  const { data, error } = await supabase.functions.invoke('whoop-proxy', { body })
  if (error || typeof data?.status !== 'number') return null
  return data as { status: number; body: any }
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
 * Exchanges an authorization code for tokens (via the proxy, which adds the
 * client credentials) and persists them. Returns whether login succeeded.
 */
export async function exchangeWhoopCode(params: {
  code: string
  redirect_uri: string
  code_verifier: string
}): Promise<boolean> {
  const res = await whoopProxy({
    action: 'token',
    params: { grant_type: 'authorization_code', ...params },
  })
  console.log('[Whoop] token status:', res?.status ?? 'proxy failed')
  const tokens = res?.status === 200 ? res.body : null
  if (!tokens?.access_token || !tokens?.refresh_token) return false
  await saveWhoopTokens(tokens)
  return true
}

/**
 * Returns the Whoop user id (as a string), fetching the basic profile once and
 * caching it in storage. Used as the NOT NULL whoop_user_id on the users row.
 */
export async function fetchWhoopUserId(): Promise<string | null> {
  const cached = await storage.getItem(KEYS.userId)
  if (cached) return cached
  try {
    const res = await whoopGet('/user/profile/basic')
    if (!res.ok) return null
    const id = res.data?.user_id != null ? String(res.data.user_id) : null
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
    const res = await whoopProxy({
      action: 'token',
      params: { grant_type: 'refresh_token', refresh_token: refreshToken },
    })
    if (!res || res.status !== 200) return null
    const data = res.body
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

async function whoopGet(path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('no_token')
  const res = await whoopProxy({ action: 'api', path, access_token: token })
  if (!res) throw new Error('proxy_failed')
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.body }
}

export async function fetchTodayWhoopData(): Promise<WhoopData> {
  const today = new Date().toISOString().split('T')[0]
  const start = `${today}T00:00:00.000Z`
  const end = `${today}T23:59:59.999Z`

  const res = await whoopGet(`/cycle?start=${start}&end=${end}`)
  if (!res.ok) throw new Error(`Whoop API error: ${res.status}`)

  const cycles: CycleRecord[] = res.data.records ?? []
  return summarizeCycles(cycles)
}
