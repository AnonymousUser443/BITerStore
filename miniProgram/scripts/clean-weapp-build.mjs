import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const generatedPaths = [
  resolve(projectRoot, 'dist'),
  resolve(projectRoot, '.swc'),
  resolve(projectRoot, 'node_modules', '.cache')
]

for (const target of generatedPaths) {
  if (!target.startsWith(`${projectRoot}\\`) && !target.startsWith(`${projectRoot}/`)) {
    throw new Error(`拒绝清理项目目录之外的路径：${target}`)
  }
  await rm(target, { recursive: true, force: true })
}

console.log('WeApp generated output and compiler caches cleared')
