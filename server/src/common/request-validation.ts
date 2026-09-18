import { BadRequestException } from '@nestjs/common'

export function strictBody(value: unknown, allowedFields: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('请求体必须是对象')
  const body = value as Record<string, unknown>
  const allowed = new Set(allowedFields)
  const unknown = Object.keys(body).filter((key) => !allowed.has(key))
  if (unknown.length) throw new BadRequestException(`包含不支持的字段：${unknown.sort().join('、')}`)
  return body
}

export function requiredBodyString(body: Record<string, unknown>, field: string, label: string, maximum: number) {
  const value = body[field]
  if (typeof value !== 'string') throw new BadRequestException(`${label}格式无效`)
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) throw new BadRequestException(`${label}长度无效`)
  return normalized
}

export function optionalBodyString(body: Record<string, unknown>, field: string, label: string, maximum: number) {
  const value = body[field]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new BadRequestException(`${label}格式无效`)
  const normalized = value.trim()
  if (normalized.length > maximum) throw new BadRequestException(`${label}过长`)
  return normalized || undefined
}
