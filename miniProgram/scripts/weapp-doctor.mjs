import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertLocalPaths, automationPort, cliPath, projectPath, root, servicePort, windowsCliInvocation } from './weapp-env.mjs'

const checks = []; const add = (name, ok, detail, blocking = true) => checks.push({ name, ok, detail, blocking })
try { assertLocalPaths(); add('paths', true, `${cliPath} | ${projectPath}`) } catch (error) { add('paths', false, error.message) }
add('node', process.versions.node.startsWith('22.13.'), process.versions.node); add('service-port', servicePort > 0, servicePort ? String(servicePort) : '未配置 WECHAT_DEVTOOLS_SERVICE_PORT')
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')); add('public-appid', project.appid === 'touristappid', project.appid)
const privatePath = path.join(root, 'project.private.config.json')
const privateProject = fs.existsSync(privatePath) ? JSON.parse(fs.readFileSync(privatePath, 'utf8')) : {}
const privateAppid = typeof privateProject.appid === 'string' && privateProject.appid !== 'touristappid' ? privateProject.appid : ''
add('private-appid', Boolean(privateAppid), privateAppid || '未配置真实 AppID；游客模式可能输出 webapi_getwxaasyncsecinfo 系统错误', false)
const outputProjectPath = path.join(root, 'dist', 'project.config.json')
const outputProject = fs.existsSync(outputProjectPath) ? JSON.parse(fs.readFileSync(outputProjectPath, 'utf8')) : {}
const outputAppid = typeof outputProject.appid === 'string' && outputProject.appid !== 'touristappid' ? outputProject.appid : ''
add('effective-appid', Boolean(outputAppid), outputAppid ? '微信构建产物已使用真实 AppID' : '微信构建产物仍为游客模式；请重新运行 npm run build:weapp', true)
const loginArgs = ['islogin', '--project', projectPath, ...(servicePort ? ['--port', String(servicePort)] : []), '--lang', 'zh']; const invocation = process.platform === 'win32' ? windowsCliInvocation(loginArgs) : { command: cliPath, args: loginArgs }; const login = spawnSync(invocation.command, invocation.args, { encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' }); const loginOutput = [login.stdout, login.stderr, login.error?.message].filter(Boolean).join('\n').trim(); add('devtools-login', login.status === 0 && /true|已登录|login/i.test(loginOutput), loginOutput.slice(-500) || `CLI 退出码 ${login.status}`)
const portFree = await new Promise((resolve) => { const server = net.createServer(); server.once('error', () => resolve(false)); server.listen(automationPort, '127.0.0.1', () => server.close(() => resolve(true))) }); add('automation-port', true, portFree ? `${automationPort} 可用于 launch` : `${automationPort} 已占用，可用于 connect`, false)
add('build-output', fs.existsSync(path.join(root, 'dist', 'app.json')), fs.existsSync(path.join(root, 'dist', 'app.json')) ? 'WeApp 构建存在' : '先运行 npm run build:weapp')
const result = { ok: !checks.some((x) => !x.ok && x.blocking), checks }; console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1
