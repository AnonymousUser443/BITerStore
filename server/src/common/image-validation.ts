import { inflateSync } from 'node:zlib'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 10_000
export const MAX_IMAGE_PIXELS = 40_000_000
const MAX_DECODED_BYTES = 64 * 1024 * 1024

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

export type ImageMetadata = {
  mime: SupportedImageMime
  width: number
  height: number
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageValidationError'
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function fail(message: string): never {
  throw new ImageValidationError(message)
}

function canonicalMime(value: string | undefined): SupportedImageMime | undefined {
  const mime = value?.split(';', 1)[0]?.trim().toLowerCase()
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' ? mime : undefined
}

function checkDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail('图片尺寸无效')
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) fail(`图片宽高不能超过 ${MAX_IMAGE_DIMENSION}px`)
  if (width * height > MAX_IMAGE_PIXELS) fail(`图片像素不能超过 ${MAX_IMAGE_PIXELS}`)
}

function detectMime(bytes: Buffer): SupportedImageMime {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'image/png'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  fail('文件内容不是受支持的图片格式')
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const value of bytes) {
    crc ^= value
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function parsePng(bytes: Buffer): ImageMetadata {
  let offset = PNG_SIGNATURE.length
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let sawHeader = false
  let sawData = false
  let sawEnd = false
  const compressed: Buffer[] = []

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('PNG 数据块不完整')
    const length = bytes.readUInt32BE(offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (length > MAX_DECODED_BYTES || dataEnd < dataStart || chunkEnd > bytes.length) fail('PNG 数据块长度无效')
    const type = bytes.toString('ascii', typeStart, dataStart)
    const data = bytes.subarray(dataStart, dataEnd)
    const expectedCrc = bytes.readUInt32BE(dataEnd)
    if (crc32(bytes.subarray(typeStart, dataEnd)) !== expectedCrc) fail('PNG 校验和无效')

    if (!sawHeader && type !== 'IHDR') fail('PNG 缺少 IHDR 头')
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) fail('PNG IHDR 无效')
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (![0, 2, 3, 4, 6].includes(colorType) || ![1, 2, 4, 8, 16].includes(bitDepth)) fail('PNG 色彩格式无效')
      if (colorType === 3 && ![1, 2, 4, 8].includes(bitDepth)) fail('PNG 调色板位深无效')
      if (colorType === 2 && bitDepth !== 8 && bitDepth !== 16) fail('PNG 真彩色位深无效')
      if (colorType === 4 && bitDepth !== 8 && bitDepth !== 16) fail('PNG 灰度透明位深无效')
      if (colorType === 6 && bitDepth !== 8 && bitDepth !== 16) fail('PNG RGBA 位深无效')
      interlace = data[12]
      if (data[10] !== 0 || data[11] !== 0 || ![0, 1].includes(interlace)) fail('PNG 压缩或过滤方式无效')
      checkDimensions(width, height)
      sawHeader = true
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd) fail('PNG IDAT 位置无效')
      sawData = true
      compressed.push(data)
    } else if (type === 'IEND') {
      if (length !== 0 || !sawData || sawEnd) fail('PNG IEND 无效')
      sawEnd = true
      if (chunkEnd !== bytes.length) fail('PNG 在 IEND 后包含额外数据')
      break
    } else if (sawEnd) {
      fail('PNG 在 IEND 后包含额外数据')
    }
    offset = chunkEnd
  }

  if (!sawHeader || !sawData || !sawEnd) fail('PNG 缺少必要数据块')
  const decoded = (() => {
    try {
      return inflateSync(Buffer.concat(compressed), { maxOutputLength: MAX_DECODED_BYTES })
    } catch {
      fail('PNG 图像数据无法解码')
    }
  })()

  // For non-interlaced PNGs the inflated stream has one filter byte per row.
  // Checking the exact row size catches truncated and many decompression-bomb files.
  if (interlace === 0) {
    const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType]
    const rowBytes = Math.ceil(width * channels * bitDepth / 8)
    const expected = (rowBytes + 1) * height
    if (decoded.length !== expected) fail('PNG 图像数据长度与尺寸不匹配')
  } else if (decoded.length === 0) {
    fail('PNG 图像数据为空')
  }
  return { mime: 'image/png', width, height }
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
])

function parseJpeg(bytes: Buffer): ImageMetadata {
  let offset = 2
  let width = 0
  let height = 0
  let sawSof = false
  let sawScan = false
  let sawEoi = false

  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) fail('JPEG 标记无效')
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) fail('JPEG 标记不完整')
    const marker = bytes[offset++]
    if (marker === 0xd9) {
      sawEoi = true
      break
    }
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) fail('JPEG 扫描段不完整')
      const segmentLength = bytes.readUInt16BE(offset)
      if (segmentLength < 2 || offset + segmentLength > bytes.length) fail('JPEG 扫描段长度无效')
      if (segmentLength < 6 || bytes[offset + 2] < 1) fail('JPEG 扫描段参数无效')
      sawScan = true
      offset += segmentLength
      // Entropy-coded data may contain FF00 byte stuffing and restart markers.
      // Stop only at a real EOI or another marker; malformed/truncated scans fail.
      let foundMarker = false
      while (offset < bytes.length) {
        if (bytes[offset++] !== 0xff) continue
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
        if (offset >= bytes.length) break
        const next = bytes[offset]
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          offset += 1
          continue
        }
        if (next === 0xd9) {
          offset += 1
          sawEoi = true
          foundMarker = true
          break
        }
        // A marker after scan data is legal (for example another SOS).
        foundMarker = true
        break
      }
      if (!sawEoi && !foundMarker) fail('JPEG 扫描数据不完整')
      if (sawEoi) break
      continue
    }
    // TEM and restart markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) fail('JPEG 段长度不完整')
    const segmentLength = bytes.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) fail('JPEG 段长度无效')
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) fail('JPEG 帧头无效')
      height = bytes.readUInt16BE(offset + 3)
      width = bytes.readUInt16BE(offset + 5)
      checkDimensions(width, height)
      sawSof = true
    }
    offset += segmentLength
  }

  if (!sawSof || !sawScan || !sawEoi) fail('JPEG 缺少有效帧或结束标记')
  if (offset !== bytes.length) fail('JPEG 结束标记后包含额外数据')
  return { mime: 'image/jpeg', width, height }
}

function parseWebp(bytes: Buffer): ImageMetadata {
  const riffSize = bytes.readUInt32LE(4)
  if (riffSize < 4 || riffSize + 8 !== bytes.length) fail('WebP RIFF 长度无效')
  let offset = 12
  let metadata: { width: number; height: number } | undefined
  let imageChunk = false
  let frameChunk = false
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('WebP 数据块不完整')
    const type = bytes.toString('ascii', offset, offset + 4)
    const length = bytes.readUInt32LE(offset + 4)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + (length % 2)
    if (dataEnd < dataStart || chunkEnd > bytes.length) fail('WebP 数据块长度无效')
    const data = bytes.subarray(dataStart, dataEnd)
    if (type === 'VP8X') {
      if (length < 10) fail('WebP VP8X 头无效')
      metadata = {
        width: 1 + data[4] + (data[5] << 8) + (data[6] << 16),
        height: 1 + data[7] + (data[8] << 8) + (data[9] << 16)
      }
      imageChunk = true
    } else if (type === 'VP8 ') {
      if (length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) fail('WebP VP8 帧无效')
      metadata = { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff }
      imageChunk = true
      frameChunk = true
    } else if (type === 'VP8L') {
      if (length < 5 || data[0] !== 0x2f) fail('WebP VP8L 帧无效')
      metadata = {
        width: 1 + (((data[2] & 0x3f) << 8) | data[1]),
        height: 1 + (((data[4] & 0x0f) << 10) | (data[3] << 2) | ((data[2] & 0xc0) >> 6))
      }
      imageChunk = true
      frameChunk = true
    }
    offset = chunkEnd
  }
  if (offset !== bytes.length || !imageChunk || !frameChunk || !metadata) fail('WebP 缺少有效图像帧')
  checkDimensions(metadata.width, metadata.height)
  return { mime: 'image/webp', ...metadata }
}

export function inspectImage(bytes: Buffer, declaredMime?: string): ImageMetadata {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) fail('图片内容为空')
  if (bytes.length > MAX_IMAGE_BYTES) fail(`图片不能超过 ${MAX_IMAGE_BYTES} 字节`)
  const detected = detectMime(bytes)
  const declared = declaredMime ? canonicalMime(declaredMime) : undefined
  if (declaredMime && (!declared || declared !== detected)) fail('文件真实格式与声明的 MIME 类型不一致')
  if (detected === 'image/png') return parsePng(bytes)
  if (detected === 'image/jpeg') return parseJpeg(bytes)
  return parseWebp(bytes)
}

export function isSupportedImageMime(value: unknown): value is SupportedImageMime {
  return typeof value === 'string' && canonicalMime(value) === value.toLowerCase()
}
