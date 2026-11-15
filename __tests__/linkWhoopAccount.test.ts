const mockStore = new Map<string, string>()
let mockSessionUserId: string | null = 'anon-device'

const mockInvoke = jest.fn()
const mockVerifyOtp = jest.fn()
const mockGetValidAccessToken = jest.fn()

jest.mock('../lib/storage', () => ({
  storage: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockStore.set(k, v),
    removeItem: async (k: string) => void mockStore.delete(k),
  },
}))
jest.mock('../lib/whoop', () => ({ getValidAccessToken: () => mockGetValidAccessToken() }))
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: mockSessionUserId ? { user: { id: mockSessionUserId } } : null } }),
      signInAnonymously: async () => {
        mockSessionUserId = 'fresh-anon'
        return { data: { user: { id: 'fresh-anon' } }, error: null }
      },
      verifyOtp: (args: unknown) => mockVerifyOtp(args),
      signOut: async () => {
        mockSessionUserId = null
        return { error: null }
      },
    },
    functions: { invoke: (name: string, opts: unknown) => mockInvoke(name, opts) },
  },
}))

import { linkWhoopAccount, isWhoopLinked, LinkWhoopError } from '../lib/auth'

beforeEach(() => {
  mockStore.clear()
  mockSessionUserId = 'anon-device'
  mockInvoke.mockReset()
  mockVerifyOtp.mockReset()
  mockGetValidAccessToken.mockReset().mockResolvedValue('whoop-token')
})

describe('linkWhoopAccount', () => {
  it('sends only the Whoop token to whoop-signin (never a Whoop user id)', async () => {
    mockInvoke.mockResolvedValue({ data: { result: 'claimed' }, error: null })
    await linkWhoopAccount()
    expect(mockInvoke).toHaveBeenCalledWith('whoop-signin', { body: { access_token: 'whoop-token' } })
  })

  it('keeps the session when this device claims the account', async () => {
    mockInvoke.mockResolvedValue({ data: { result: 'claimed' }, error: null })
    await expect(linkWhoopAccount()).resolves.toBe('claimed')
    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(await isWhoopLinked()).toBe(true)
  })

  it('redeems the one-time token to switch into the existing account', async () => {
    mockInvoke.mockResolvedValue({ data: { result: 'switch', token_hash: 'th', verification_type: 'magiclink' }, error: null })
    mockVerifyOtp.mockImplementation(async () => {
      mockSessionUserId = 'whoop-account'
      return { error: null }
    })
    await expect(linkWhoopAccount()).resolves.toBe('switched')
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'magiclink' })
    // Linked flag is stored for the new session, not the old anonymous one.
    expect(mockStore.get('dimer_linked_uid')).toBe('whoop-account')
    expect(await isWhoopLinked()).toBe(true)
  })

  it('fails without a Whoop token', async () => {
    mockGetValidAccessToken.mockResolvedValue(null)
    await expect(linkWhoopAccount()).rejects.toMatchObject({ code: 'no_whoop_token' })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('passes the server error code through', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'whoop_unauthorized' }, error: null })
    await expect(linkWhoopAccount()).rejects.toMatchObject({ code: 'whoop_unauthorized' })
    expect(await isWhoopLinked()).toBe(false)
  })

  it('reports an unreachable function', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('FunctionsFetchError') })
    await expect(linkWhoopAccount()).rejects.toBeInstanceOf(LinkWhoopError)
    await expect(linkWhoopAccount()).rejects.toMatchObject({ code: 'unreachable' })
  })

  it('recovers when the stored session belongs to a removed user', async () => {
    mockInvoke
      .mockResolvedValueOnce({ data: { error: 'not_signed_in' }, error: null })
      .mockResolvedValueOnce({ data: { result: 'switch', token_hash: 'th' }, error: null })
    mockVerifyOtp.mockImplementation(async () => {
      mockSessionUserId = 'whoop-account'
      return { error: null }
    })
    await expect(linkWhoopAccount()).resolves.toBe('switched')
    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(mockStore.get('dimer_linked_uid')).toBe('whoop-account')
  })

  it('does not mark the device linked if redeeming the token fails', async () => {
    mockInvoke.mockResolvedValue({ data: { result: 'switch', token_hash: 'th' }, error: null })
    mockVerifyOtp.mockResolvedValue({ error: new Error('otp expired') })
    await expect(linkWhoopAccount()).rejects.toMatchObject({ code: 'signin_failed' })
    expect(await isWhoopLinked()).toBe(false)
  })
})

describe('isWhoopLinked', () => {
  it('is false when the stored link belongs to a different session', async () => {
    mockStore.set('dimer_linked_uid', 'some-other-session')
    expect(await isWhoopLinked()).toBe(false)
  })
})
