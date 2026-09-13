import { describe, expect, it } from 'vitest'
import { ImageValidationError, inspectImage } from '../src/common/image-validation.js'

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

function onePixelJpeg() {
  // A structurally valid 1x1 baseline JPEG with an empty entropy payload.
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xff, 0xd9
  ])
}

function onePixelWebp() {
  const frame = Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00])
  const chunk = Buffer.concat([Buffer.from('VP8L'), Buffer.from([frame.length, 0, 0, 0]), frame, Buffer.from([0])])
  const riffSize = 4 + chunk.length
  return Buffer.concat([Buffer.from('RIFF'), Buffer.from([riffSize, 0, 0, 0]), Buffer.from('WEBP'), chunk])
}

describe('image content validation', () => {
  it('checks PNG structure, MIME and dimensions', () => {
    expect(inspectImage(onePixelPng, 'image/png')).toEqual({ mime: 'image/png', width: 1, height: 1 })
    expect(() => inspectImage(onePixelPng, 'image/jpeg')).toThrow(ImageValidationError)
  })

  it('recognizes JPEG and WebP headers instead of trusting extensions', () => {
    expect(inspectImage(onePixelJpeg(), 'image/jpeg')).toMatchObject({ mime: 'image/jpeg', width: 1, height: 1 })
    expect(inspectImage(onePixelWebp(), 'image/webp')).toMatchObject({ mime: 'image/webp', width: 1, height: 1 })
  })

  it('rejects truncated, corrupt and oversized image content', () => {
    expect(() => inspectImage(Buffer.from('not-an-image'), 'image/png')).toThrow(ImageValidationError)
    const corrupt = Buffer.from(onePixelPng)
    corrupt[corrupt.length - 1] ^= 0xff
    expect(() => inspectImage(corrupt, 'image/png')).toThrow(/校验和|解码/)
  })

  it('rejects dimensions that exceed the pixel budget even when the payload is tiny', () => {
    const oversized = Buffer.from(onePixelPng)
    // Locate the IHDR width/height fields in the standard fixture.
    oversized.writeUInt32BE(20_000, 16)
    oversized.writeUInt32BE(20_000, 20)
    expect(() => inspectImage(oversized, 'image/png')).toThrow(ImageValidationError)
  })
})
