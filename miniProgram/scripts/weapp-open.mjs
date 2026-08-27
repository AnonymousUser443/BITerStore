import { spawn } from 'node:child_process'
import { assertLocalPaths, cliPath, commandArgs, windowsCliInvocation } from './weapp-env.mjs'

assertLocalPaths(); const args = commandArgs('auto'); const invocation = process.platform === 'win32' ? windowsCliInvocation(args) : { command: cliPath, args }; const child = spawn(invocation.command, invocation.args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' }); child.unref(); console.log(JSON.stringify({ ok: true, pid: child.pid, message: '微信开发者工具自动化通道启动中' }))
