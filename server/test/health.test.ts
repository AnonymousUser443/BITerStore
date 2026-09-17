import { afterEach, describe, expect, it, vi } from 'vitest'
import { HealthController } from '../src/health.controller.js'

const originalEnvironment = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnvironment }
})

describe('health endpoints', () => {
  it('keeps liveness independent from downstream dependencies', () => {
    const controller = new HealthController({} as never, {} as never)
    expect(controller.health()).toMatchObject({ status: 'ok' })
  })

  it('checks database, Redis and writable local storage for readiness', async () => {
    process.env.NODE_ENV = 'test'
    process.env.LOCAL_UPLOAD_DIR = '.'
    process.env.READINESS_CACHE_MS = '0'
    const controller = new HealthController(
      { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } as never,
      { ensureConnected: vi.fn().mockResolvedValue(undefined), client: { ping: vi.fn().mockResolvedValue('PONG') } } as never
    )

    await expect(controller.ready()).resolves.toMatchObject({
      status: 'ready',
      checks: { database: 'ok', redis: 'ok', storage: 'ok', bitLogin: 'skipped' }
    })
  })

  it('returns 503 readiness when a required dependency fails', async () => {
    process.env.NODE_ENV = 'test'
    process.env.LOCAL_UPLOAD_DIR = '.'
    process.env.READINESS_CACHE_MS = '0'
    const controller = new HealthController(
      { $queryRaw: vi.fn().mockRejectedValue(new Error('database down')) } as never,
      { ensureConnected: vi.fn().mockResolvedValue(undefined), client: { ping: vi.fn().mockResolvedValue('PONG') } } as never
    )

    await expect(controller.ready()).rejects.toMatchObject({ status: 503 })
  })
})
