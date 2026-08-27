import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const size = 81
const output = path.resolve('src/assets/tabbar')
const colors = { default: '#7f846f', selected: '#4f5940' }

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}
function png(pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const scanlines = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines)), chunk('IEND')])
}
function canvas(hex) {
  const pixels = Buffer.alloc(size * size * 4)
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  const dot = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const index = (Math.round(y) * size + Math.round(x)) * 4
    pixels.set([...rgb, 255], index)
  }
  const disk = (cx, cy, radius) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) for (let x = cx - radius; x <= cx + radius; x += 1) if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) dot(x, y)
  }
  const line = (x1, y1, x2, y2, width = 5) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
    for (let step = 0; step <= steps; step += 1) disk(Math.round(x1 + ((x2 - x1) * step) / steps), Math.round(y1 + ((y2 - y1) * step) / steps), width / 2)
  }
  const circle = (cx, cy, radius, width = 5) => { for (let degree = 0; degree < 360; degree += 1) disk(Math.round(cx + Math.cos(degree * Math.PI / 180) * radius), Math.round(cy + Math.sin(degree * Math.PI / 180) * radius), width / 2) }
  const rect = (left, top, right, bottom) => { for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) dot(x, y) }
  return { pixels, dot, disk, line, circle, rect }
}

const icons = {
  home(c) { c.line(18, 39, 40, 18); c.line(40, 18, 63, 39); c.line(23, 35, 23, 63); c.line(58, 35, 58, 63); c.line(23, 63, 58, 63); c.line(34, 63, 34, 48); c.line(34, 48, 47, 48); c.line(47, 48, 47, 63) },
  category(c) { for (const y of [23, 47]) for (const x of [23, 47]) { c.rect(x, y, x + 11, y + 11) } },
  publish(c) { c.circle(40, 40, 27, 4); c.line(40, 25, 40, 55, 5); c.line(25, 40, 55, 40, 5) },
  messages(c) { c.line(20, 23, 61, 23); c.line(20, 23, 20, 56); c.line(61, 23, 61, 56); c.line(20, 56, 46, 56); c.line(46, 56, 56, 65); c.line(56, 65, 56, 56); c.line(56, 56, 61, 56) },
  profile(c) { c.circle(40, 28, 11, 5); for (let degree = 205; degree <= 335; degree += 1) c.disk(Math.round(40 + Math.cos(degree * Math.PI / 180) * 27), Math.round(66 + Math.sin(degree * Math.PI / 180) * 27), 3) }
}

fs.mkdirSync(output, { recursive: true })
for (const [name, draw] of Object.entries(icons)) for (const [state, color] of Object.entries(colors)) {
  const target = canvas(color); draw(target)
  fs.writeFileSync(path.join(output, `${name}-${state}.png`), png(target.pixels))
}
