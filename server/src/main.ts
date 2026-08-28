import 'reflect-metadata'
import cookie from '@fastify/cookie'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'
import fastifyStatic from '@fastify/static'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }))
  const uploadRoot = resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads')
  await mkdir(uploadRoot, { recursive: true })
  app.getHttpAdapter().getInstance().addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: 5 * 1024 * 1024 }, (_request, body, done) => done(null, body))
  await app.register(fastifyStatic, { root: uploadRoot, prefix: '/media/' })
  await app.register(cookie, { secret: process.env.ACCESS_TOKEN_SECRET })
  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: (process.env.H5_ORIGIN || '').split(',').filter(Boolean), credentials: true })
  const config = new DocumentBuilder().setTitle('BITerStore API').setVersion('1').addBearerAuth().build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config))
  await app.listen(Number(process.env.PORT || 3100), '0.0.0.0')
}
void bootstrap()
