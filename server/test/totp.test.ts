import { describe, expect, it } from 'vitest'
import { decryptTotp, encryptTotp, verifyTotp } from '../src/common/totp.js'

describe('admin TOTP', () => {
  it('validates the RFC 6238 SHA-1 vector truncated to six digits', () => {
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000)).toBe(true)
    expect(verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '000000', 59_000)).toBe(false)
  })
  it('encrypts stored administrator secrets', () => {
    process.env.ADMIN_TOTP_ENCRYPTION_KEY = 'test-only-encryption-key'
    const encrypted = encryptTotp('ABCDEF234567')
    expect(encrypted).not.toContain('ABCDEF234567')
    expect(decryptTotp(encrypted)).toBe('ABCDEF234567')
  })
})
