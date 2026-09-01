import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const privateConfigPath = path.join(root, 'project.private.config.json')
const outputConfigPath = path.join(root, 'dist', 'project.config.json')

if (!fs.existsSync(outputConfigPath)) {
  throw new Error(`微信构建配置不存在: ${outputConfigPath}`)
}

const privateConfig = fs.existsSync(privateConfigPath)
  ? JSON.parse(fs.readFileSync(privateConfigPath, 'utf8'))
  : {}
const appid = typeof privateConfig.appid === 'string' ? privateConfig.appid.trim() : ''
const libVersion = typeof privateConfig.libVersion === 'string' ? privateConfig.libVersion.trim() : ''

const outputConfig = JSON.parse(fs.readFileSync(outputConfigPath, 'utf8'))
const synced = []
if (appid && appid !== 'touristappid') {
  outputConfig.appid = appid
  synced.push('AppID')
}
if (libVersion) {
  outputConfig.libVersion = libVersion
  synced.push('libVersion')
}

if (!synced.length) {
  console.warn('[weapp-config] 未配置私有 AppID 或 libVersion，继续使用公开配置')
  process.exit(0)
}

fs.writeFileSync(outputConfigPath, `${JSON.stringify(outputConfig, null, 2)}\n`)
console.log(`[weapp-config] 已将本机私有 ${synced.join('、')} 同步到微信构建产物`)
