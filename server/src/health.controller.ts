import { Controller, Get, Header, Logger, ServiceUnavailableException } from '@nestjs/common'
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaService } from './infra/prisma.service.js'
import { RedisService } from './infra/redis.service.js'

type CheckStatus = 'ok' | 'skipped' | 'failed'
type ReadinessResult = { status: 'ready' | 'unavailable'; time: string; checks: Record<string, CheckStatus> }

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)
  private readonly s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: process.env.R2_ACCESS_KEY_ID
      ? { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '' }
      : undefined
  })
  private cached?: { expiresAt: number; result: ReadinessResult }
  private pending?: Promise<ReadinessResult>

  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  health() {
    return { status: 'ok', time: new Date().toISOString() }
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready() {
    const result = await this.readiness()
    if (result.status !== 'ready') throw new ServiceUnavailableException(result)
    return result
  }

  private async readiness() {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.result
    if (this.pending) return this.pending
    this.pending = this.runChecks().then((result) => {
      this.cached = { expiresAt: Date.now() + this.cacheMilliseconds(), result }
      return result
    }).finally(() => { this.pending = undefined })
    return this.pending
  }

  private async runChecks(): Promise<ReadinessResult> {
    const timeout = this.timeoutMilliseconds()
    const checks: Record<string, CheckStatus> = {}
    const startedAt = Date.now()
    const outcomes = await Promise.allSettled([
      this.withTimeout(this.prisma.$queryRaw`SELECT 1`, timeout),
      this.withTimeout(this.redis.ensureConnected().then(() => this.redis.client.ping()), timeout),
      this.checkStorage(timeout),
      this.checkBitLogin(timeout)
    ])
    const names = ['database', 'redis', 'storage', 'bitLogin']
    outcomes.forEach((outcome, index) => {
      checks[names[index]] = outcome.status === 'fulfilled'
        ? index < 2 ? 'ok' : outcome.value as CheckStatus
        : 'failed'
      if (outcome.status === 'rejected') {
        this.logger.warn(JSON.stringify({
          event: 'readiness_check_failed',
          check: names[index],
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          timeoutMs: timeout,
          durationMs: Date.now() - startedAt
        }))
      }
    })
    const result: ReadinessResult = {
      status: Object.values(checks).every((status) => status === 'ok' || status === 'skipped') ? 'ready' : 'unavailable',
      time: new Date().toISOString(),
      checks
    }
    if (result.status === 'unavailable') {
      this.logger.warn(JSON.stringify({ event: 'readiness_unavailable', ...result, durationMs: Date.now() - startedAt }))
    }
    return result
  }

  private async checkStorage(timeout: number): Promise<CheckStatus> {
    const storage = process.env.UPLOAD_STORAGE || 'local'
    if (storage === 'local' || storage === 'dual') {
      await this.withTimeout(access(resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads'), constants.R_OK | constants.W_OK), timeout)
    }
    if (storage === 'r2' || storage === 'dual') {
      if (!process.env.R2_ENDPOINT || !process.env.R2_BUCKET || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2 configuration incomplete')
      await this.s3.send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET }), { abortSignal: AbortSignal.timeout(timeout) })
    }
    return 'ok'
  }

  private async checkBitLogin(timeout: number): Promise<CheckStatus> {
    const url = process.env.BIT_LOGIN_HEALTH_URL?.trim()
    if (!url) {
      if (process.env.NODE_ENV === 'production') throw new Error('BIT_LOGIN_HEALTH_URL is required in production')
      return 'skipped'
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'error' })
    if (!response.ok) throw new Error(`BIT-Login health returned ${response.status}`)
    return 'ok'
  }

  private withTimeout<T>(operation: Promise<T>, timeout: number) {
    return Promise.race<T>([
      operation,
      new Promise<T>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('readiness check timed out')), timeout)
        timer.unref?.()
      })
    ])
  }

  private timeoutMilliseconds() {
    const value = Number(process.env.READINESS_TIMEOUT_MS)
    return Number.isSafeInteger(value) && value >= 250 && value <= 10_000 ? value : 5_000
  }

  private cacheMilliseconds() {
    const value = Number(process.env.READINESS_CACHE_MS)
    return Number.isSafeInteger(value) && value >= 0 && value <= 60_000 ? value : 10_000
  }
}
