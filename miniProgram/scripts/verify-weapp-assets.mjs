import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const webpDirectory = path.join(root, 'src', 'assets')
const pngDirectory = path.join(root, 'src', 'assets-weapp')
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const maximumAssetBytes = 384 * 1024

const originals = fs.readdirSync(webpDirectory)
  .filter((name) => name.endsWith('.webp'))
  .map((name) => name.replace(/\.webp$/, ''))
  .sort()
const variants = fs.readdirSync(pngDirectory)
  .filter((name) => name.endsWith('.png'))
  .map((name) => name.replace(/\.png$/, ''))
  .sort()

const missing = originals.filter((name) => !variants.includes(name))
const unexpected = variants.filter((name) => !originals.includes(name))
if (missing.length || unexpected.length) {
  throw new Error(`微信 PNG 素材集不完整：missing=${missing.join(',') || '-'} unexpected=${unexpected.join(',') || '-'}`)
}

let bytes = 0
for (const name of variants) {
  const file = path.join(pngDirectory, `${name}.png`)
  const buffer = fs.readFileSync(file)
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) throw new Error(`${file} 不是有效 PNG`)
  if (buffer.length > maximumAssetBytes) throw new Error(`${file} 超出 384 KiB 单资源预算`)
  bytes += buffer.length
}

const sourceFiles = []
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory() && entry.name !== 'assets' && entry.name !== 'assets-weapp') collect(target)
    else if (entry.isFile() && /\.(?:css|ts|tsx)$/.test(entry.name)) sourceFiles.push(target)
  }
}
collect(path.join(root, 'src'))
const directLocalWebpReferences = sourceFiles.flatMap((file) => {
  const content = fs.readFileSync(file, 'utf8')
  return [...content.matchAll(/\/assets\/[^'"`)\s]+\.webp/gi)].map((match) => `${path.relative(root, file)}: ${match[0]}`)
})
if (directLocalWebpReferences.length) throw new Error(`微信源码仍直接引用本地 WebP：\n${directLocalWebpReferences.join('\n')}`)

console.log(`WeApp bundled assets verified: ${variants.length} PNG files, ${(bytes / 1024).toFixed(1)} KiB`)
