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

if (!appid || appid === 'touristappid') {
  console.warn('[weapp-config] 未配置真实 AppID，继续使用游客模式')
  process.exit(0)
}

const outputConfig = JSON.parse(fs.readFileSync(outputConfigPath, 'utf8'))
outputConfig.appid = appid
fs.writeFileSync(outputConfigPath, `${JSON.stringify(outputConfig, null, 2)}\n`)
console.log('[weapp-config] 已将本机私有 AppID 注入微信构建产物')
