import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController } from '../src/modules/auth/auth.controller.js'

describe('H5 cookie sessions', () => {
  const originalEnv = { ...process.env }
  const session = {
    accessToken: 'access-token', refreshToken: 'refresh-token', expiresIn: 900,
    user: { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' }
  }
  let auth: any
  let controller: AuthController
  let reply: any

  beforeEach(() => {
    process.env.NODE_ENV = 'production'
    process.env.REFRESH_TOKEN_TTL_DAYS = '30'
    auth = { campus: vi.fn().mockResolvedValue(session), refresh: vi.fn().mockResolvedValue(session), logout: vi.fn().mockResolvedValue({ ok: true }) }
    controller = new AuthController(auth)
    reply = { setCookie: vi.fn(), clearCookie: vi.fn() }
  })

  afterEach(() => { process.env = { ...originalEnv } })

  it('sets strict HttpOnly cookies without returning tokens to H5', async () => {
    const result = await controller.campus({ registrationToken: 'jwt', platform: 'h5', sessionTransport: 'cookie' }, reply)
    expect(result).toEqual({ expiresIn: 900, user: session.user })
    expect(reply.setCookie).toHaveBeenCalledWith('biterstore_access', 'access-token', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1' }))
    expect(reply.setCookie).toHaveBeenCalledWith('biterstore_refresh', 'refresh-token', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth', maxAge: 2592000 }))
  })

  it('keeps the token response for non-browser clients', async () => {
    await expect(controller.campus({ registrationToken: 'jwt', platform: 'weapp' }, reply)).resolves.toEqual(session)
    expect(reply.setCookie).not.toHaveBeenCalled()
  })

  it('rotates a refresh cookie and clears both cookies on logout', async () => {
    await controller.refresh({ sessionTransport: 'cookie' }, { cookies: { biterstore_refresh: 'old-refresh' } } as any, reply)
    expect(auth.refresh).toHaveBeenCalledWith('old-refresh')
    expect(reply.setCookie).toHaveBeenCalledTimes(2)

    await controller.logout({}, { cookies: { biterstore_refresh: 'refresh-token' } } as any, reply)
    expect(auth.logout).toHaveBeenCalledWith('refresh-token')
    expect(reply.clearCookie).toHaveBeenCalledWith('biterstore_access', expect.objectContaining({ path: '/api/v1' }))
    expect(reply.clearCookie).toHaveBeenCalledWith('biterstore_refresh', expect.objectContaining({ path: '/api/v1/auth' }))
  })
})
