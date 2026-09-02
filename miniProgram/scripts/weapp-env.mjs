import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.weapp.local'), quiet: true })
export const cliPath = process.env.WECHAT_DEVTOOLS_CLI || 'D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat'
export const projectPath = process.env.WEAPP_PROJECT_PATH || root
export const servicePort = Number(process.env.WECHAT_DEVTOOLS_SERVICE_PORT || 0)
export const automationPort = Number(process.env.WEAPP_AUTOMATION_PORT || 9420)
export const wsEndpoint = `ws://127.0.0.1:${automationPort}`
export function commandArgs(command, extraArgs = []) { const args = command === 'quit' ? [command] : [command, '--project', projectPath]; if (command === 'auto') args.push('--auto-port', String(automationPort), '--trust-project'); args.push(...extraArgs); if (servicePort) args.push('--port', String(servicePort)); if (process.env.WECHAT_DEVTOOLS_CLI_TOKEN) args.push('--token', process.env.WECHAT_DEVTOOLS_CLI_TOKEN); args.push('--lang', 'zh'); return args }
export function windowsCliInvocation(args) { const quote = (value) => `"${String(value).replaceAll('"', '""')}"`; const commandLine = [cliPath, ...args].map(quote).join(' '); return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${commandLine}"`] } }
export function assertLocalPaths() { if (!fs.existsSync(cliPath)) throw new Error(`微信 CLI 不存在: ${cliPath}`); if (!fs.existsSync(path.join(projectPath, 'project.config.json'))) throw new Error(`微信项目配置不存在: ${projectPath}`) }
