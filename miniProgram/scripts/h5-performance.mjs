import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const indexPath = path.join(dist, 'index.html')
const budgets = {
  initialBytes: 400 * 1024,
  largestAssetBytes: 384 * 1024,
  totalBytes: 3 * 1024 * 1024
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(absolute) : [absolute]
  })
}

function bytesLabel(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

if (!fs.existsSync(indexPath)) {
  throw new Error('缺少 dist/index.html，请先执行 npm run build:h5')
}

const html = fs.readFileSync(indexPath, 'utf8')
const initialUrls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
  .map((match) => decodeURIComponent(match[1].split('?')[0]))
const initialFiles = [...new Set(initialUrls)]
  .map((url) => path.join(dist, url.replace(/^\/+/, '')))
  .filter((file) => fs.existsSync(file))
const files = walk(dist).filter((file) => !file.endsWith('.map'))
const sizedFiles = files.map((file) => ({
  file: path.relative(dist, file).replaceAll('\\', '/'),
  bytes: fs.statSync(file).size
}))
const initialBytes = initialFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0)
const totalBytes = sizedFiles.reduce((sum, file) => sum + file.bytes, 0)
const largest = sizedFiles.sort((left, right) => right.bytes - left.bytes)[0]
const failures = []

if (!initialFiles.length) failures.push('未从 index.html 找到首屏 JS/CSS 资源')
if (initialBytes > budgets.initialBytes) failures.push(`首屏资源 ${bytesLabel(initialBytes)} 超过 ${bytesLabel(budgets.initialBytes)}`)
if (largest?.bytes > budgets.largestAssetBytes) failures.push(`最大资源 ${largest.file} 为 ${bytesLabel(largest.bytes)}，超过 ${bytesLabel(budgets.largestAssetBytes)}`)
if (totalBytes > budgets.totalBytes) failures.push(`H5 总静态资源 ${bytesLabel(totalBytes)} 超过 ${bytesLabel(budgets.totalBytes)}`)

const report = {
  ok: failures.length === 0,
  initial: { bytes: initialBytes, label: bytesLabel(initialBytes), files: initialFiles.map((file) => path.relative(dist, file).replaceAll('\\', '/')) },
  largest: largest && { ...largest, label: bytesLabel(largest.bytes) },
  total: { bytes: totalBytes, label: bytesLabel(totalBytes), files: sizedFiles.length },
  budgets,
  failures
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exitCode = 1
