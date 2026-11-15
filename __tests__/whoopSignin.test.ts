import { planLink, parseWhoopUserId, syntheticEmail, type LinkInput } from '../supabase/functions/whoop-signin/logic'

const WHOOP = '12345'
const base: LinkInput = {
  callerId: 'device-b',
  callerIsAnonymous: true,
  callerWhoopUserId: null,
  whoopUserId: WHOOP,
  ownerId: null,
}

describe('planLink', () => {
  it('lets the first device claim a Whoop user nobody owns', () => {
    expect(planLink(base)).toEqual({ kind: 'claim' })
  })

  it('lets a device with only the placeholder row (from saving food) claim', () => {
    expect(planLink({ ...base, callerWhoopUserId: 'device-b' })).toEqual({ kind: 'claim' })
  })

  it('does nothing extra when the caller already is the account', () => {
    expect(planLink({ ...base, callerWhoopUserId: WHOOP, ownerId: 'device-b' })).toEqual({ kind: 'already_linked' })
  })

  it('switches a new anonymous device to the existing account and merges its entries', () => {
    expect(planLink({ ...base, callerWhoopUserId: 'device-b', ownerId: 'device-a' })).toEqual({
      kind: 'switch',
      ownerId: 'device-a',
      mergeFrom: 'device-b',
    })
  })

  it('switches a device that never saved anything (the merge is a no-op that removes the empty user)', () => {
    expect(planLink({ ...base, ownerId: 'device-a' })).toEqual({ kind: 'switch', ownerId: 'device-a', mergeFrom: 'device-b' })
  })

  it('never merges a session that belongs to a different Whoop user', () => {
    expect(planLink({ ...base, callerWhoopUserId: '99999', ownerId: 'device-a' })).toEqual({
      kind: 'switch',
      ownerId: 'device-a',
      mergeFrom: null,
    })
  })

  it('never merges a permanent (non-anonymous) session', () => {
    expect(planLink({ ...base, callerIsAnonymous: false, callerWhoopUserId: 'device-b', ownerId: 'device-a' })).toEqual({
      kind: 'switch',
      ownerId: 'device-a',
      mergeFrom: null,
    })
  })

  it('creates a separate account instead of re-pointing a session linked to another Whoop user', () => {
    expect(planLink({ ...base, callerWhoopUserId: '99999' })).toEqual({ kind: 'create_and_switch' })
  })
})

describe('parseWhoopUserId', () => {
  it('accepts positive integer ids as numbers or strings', () => {
    expect(parseWhoopUserId(12345)).toBe('12345')
    expect(parseWhoopUserId('12345')).toBe('12345')
  })

  it('rejects anything else', () => {
    for (const v of [0, -1, 1.5, '', '0', '12a', 'abc', null, undefined, {}, NaN]) {
      expect(parseWhoopUserId(v)).toBeNull()
    }
  })
})

describe('syntheticEmail', () => {
  it('uses the reserved, undeliverable .invalid domain', () => {
    expect(syntheticEmail('12345')).toBe('whoop-12345@users.dimer.invalid')
  })
})
