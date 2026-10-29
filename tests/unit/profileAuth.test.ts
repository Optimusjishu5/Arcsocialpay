import { describe, expect, test } from 'bun:test'
import { privateKeyToAccount } from 'viem/accounts'
import {
  AVATAR_DATA_URL_PATTERN,
  PROFILE_DOMAIN,
  PROFILE_TYPES,
  USERNAME_PATTERN,
  profileTypedMessage,
  verifyProfileSignature,
  type ProfileFields,
} from '../../src/lib/chatAuth'

const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')

async function signed(over: Partial<ProfileFields> = {}) {
  const fields: ProfileFields = {
    address: account.address,
    username: 'alice_arc',
    bio: 'Paying friends in USDC',
    avatarUrl: 'data:image/jpeg;base64,AAAA',
    accent: 'violet',
    updatedAt: Date.now(),
    ...over,
  }
  const signature = await account.signTypedData({
    domain: PROFILE_DOMAIN,
    types: PROFILE_TYPES,
    primaryType: 'ProfileUpdate',
    message: profileTypedMessage(fields),
  })
  return { fields, signature }
}

describe('profile signatures', () => {
  test('accepts the owner signature', async () => {
    const { fields, signature } = await signed()
    expect(await verifyProfileSignature(fields, signature)).toBe(true)
  })

  test('rejects any changed field', async () => {
    const { fields, signature } = await signed()
    expect(await verifyProfileSignature({ ...fields, username: 'mallory' }, signature)).toBe(false)
    expect(await verifyProfileSignature({ ...fields, bio: 'x' }, signature)).toBe(false)
    expect(await verifyProfileSignature({ ...fields, avatarUrl: 'data:image/jpeg;base64,BBBB' }, signature)).toBe(false)
    expect(await verifyProfileSignature({ ...fields, accent: 'rose' }, signature)).toBe(false)
  })

  test('rejects a signature from another wallet', async () => {
    const { fields, signature } = await signed()
    const other = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const
    expect(await verifyProfileSignature({ ...fields, address: other }, signature)).toBe(false)
  })

  test('works with no picture', async () => {
    const { fields, signature } = await signed({ avatarUrl: '' })
    expect(await verifyProfileSignature(fields, signature)).toBe(true)
  })
})

describe('profile input rules', () => {
  test('usernames', () => {
    expect(USERNAME_PATTERN.test('alice_arc')).toBe(true)
    expect(USERNAME_PATTERN.test('a.b')).toBe(true)
    expect(USERNAME_PATTERN.test('ab')).toBe(false)
    expect(USERNAME_PATTERN.test('has space')).toBe(false)
    expect(USERNAME_PATTERN.test('x'.repeat(21))).toBe(false)
    expect(USERNAME_PATTERN.test('<script>')).toBe(false)
  })

  test('pictures must be image data URLs', () => {
    expect(AVATAR_DATA_URL_PATTERN.test('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(AVATAR_DATA_URL_PATTERN.test('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(AVATAR_DATA_URL_PATTERN.test('https://evil.example/a.png')).toBe(false)
    expect(AVATAR_DATA_URL_PATTERN.test('javascript:alert(1)')).toBe(false)
  })
})
