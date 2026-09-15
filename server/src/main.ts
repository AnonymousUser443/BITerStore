import 'reflect-metadata'
import cookie from '@fastify/cookie'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { accessTokenSecret, assertSecurityConfiguration, securityHeadersForRequest } from './common/security-config.js'

async function bootstrap() {
  assertSecurityConfiguration()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true, trustProxy: process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true' }))
  const uploadRoot = resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads')
  await mkdir(uploadRoot, { recursive: true })
  app.getHttpAdapter().getInstance().addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 }, (_request, body, done) => done(null, body))
  app.getHttpAdapter().getInstance().addHook('onSend', async (request, reply, payload) => {
    const headers = securityHeadersForRequest(request as { url?: string; protocol?: string; headers?: Record<string, unknown> })
    for (const [name, value] of Object.entries(headers)) reply.header(name, value)
    return payload
  })
  await app.register(cookie, { secret: accessTokenSecret() })
  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: (process.env.H5_ORIGIN || '').split(',').filter(Boolean), credentials: true })
  const config = new DocumentBuilder().setTitle('梨苑儿 API').setVersion('1').addBearerAuth().build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config))
  await app.listen(Number(process.env.PORT || 3100), '0.0.0.0')
}
void bootstrap()
