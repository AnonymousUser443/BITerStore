import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const policyPath = path.join(scriptDirectory, '..', 'security', 'npm-audit-policy.json')
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'))
const npmCliPath = process.env.npm_execpath
if (!npmCliPath) {
  throw new Error('请通过 npm run audit:dependencies 执行依赖审计')
}
const audit = spawnSync(process.execPath, [npmCliPath, 'audit', '--json'], {
  cwd: path.join(scriptDirectory, '..'),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
  windowsHide: true
})

if (audit.error) {
  throw audit.error
}

let report
try {
  report = JSON.parse(audit.stdout)
} catch {
  const detail = [audit.stdout, audit.stderr].filter(Boolean).join('\n').trim()
  throw new Error(`npm audit 未返回有效 JSON：${detail || `退出码 ${audit.status}`}`)
}

if (report.error) {
  throw new Error(`npm audit 执行失败：${report.error.summary || report.error.code || '未知错误'}`)
}

const acceptedSources = new Set(policy.acceptedAdvisories.map(({ source }) => source))
const observedSources = new Set()
for (const vulnerability of Object.values(report.vulnerabilities || {})) {
  for (const advisory of vulnerability.via || []) {
    if (typeof advisory === 'object' && Number.isInteger(advisory.source)) {
      observedSources.add(advisory.source)
    }
  }
}

const unexpectedSources = [...observedSources].filter((source) => !acceptedSources.has(source))
const counts = report.metadata?.vulnerabilities || {}
const exceededCounts = Object.entries(policy.maximumCounts)
  .filter(([severity, maximum]) => (counts[severity] || 0) > maximum)
  .map(([severity, maximum]) => `${severity}: ${counts[severity]} > ${maximum}`)
const reviewExpired = Date.now() > Date.parse(`${policy.reviewAfter}T23:59:59Z`)

if (unexpectedSources.length || exceededCounts.length || reviewExpired) {
  const reasons = [
    unexpectedSources.length ? `出现未批准 advisory：${unexpectedSources.join(', ')}` : '',
    exceededCounts.length ? `漏洞路径数超过上限：${exceededCounts.join(', ')}` : '',
    reviewExpired ? `例外复核期限已过：${policy.reviewAfter}` : ''
  ].filter(Boolean)
  throw new Error(`依赖安全审计未通过。${reasons.join('；')}`)
}

if (audit.status !== 0 && observedSources.size === 0) {
  throw new Error(`npm audit 退出码为 ${audit.status}，但未识别到 advisory`)
}

console.log(
  `依赖安全审计通过：${counts.total || 0} 条依赖路径仅涉及 ${observedSources.size} 个已审查的上游 advisory；复核期限 ${policy.reviewAfter}。`
)
