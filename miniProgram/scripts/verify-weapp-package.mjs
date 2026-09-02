import fs from 'node:fs'
import path from 'node:path'

const outputDirectory = path.join(process.cwd(), 'dist')
const maximumMainPackageBytes = 1.5 * 1024 * 1024

if (!fs.existsSync(outputDirectory)) {
  throw new Error(`微信构建产物不存在：${outputDirectory}`)
}

const files = []
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(target)
    else if (entry.isFile()) files.push(target)
  }
}
collect(outputDirectory)

const webpFiles = files.filter((file) => path.extname(file).toLowerCase() === '.webp')
if (webpFiles.length) {
  throw new Error(`微信产物仍包含真机不兼容的包内 WebP：\n${webpFiles.map((file) => path.relative(outputDirectory, file)).join('\n')}`)
}

const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0)
if (bytes > maximumMainPackageBytes) {
  throw new Error(`微信主包 ${(bytes / 1024).toFixed(1)} KiB 超出 1.5 MiB 预览预算`)
}

const encodedBytes = Math.ceil(bytes / 3) * 4
console.log(
  `WeApp package verified: ${files.length} files, ${(bytes / 1024).toFixed(1)} KiB raw, ` +
  `${(encodedBytes / 1024).toFixed(1)} KiB estimated upload payload, 0 WebP files`
)
