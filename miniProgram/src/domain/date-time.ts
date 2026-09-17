type Timestamped = { id: string; createdAt: string }

function parsedTime(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function clock(date: Date) { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` }
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() }

export function formatMessageTime(value: string, now = new Date()) {
  const timestamp = parsedTime(value)
  if (timestamp === null) return value || '刚刚'
  const date = new Date(timestamp)
  const dayDifference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDifference === 0) return clock(date)
  if (dayDifference === 1) return `昨天 ${clock(date)}`
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${clock(date)}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clock(date)}`
}

export function formatThreadTime(value: string, now = new Date()) {
  const timestamp = parsedTime(value)
  if (timestamp === null) return value || '刚刚'
  const date = new Date(timestamp)
  const dayDifference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDifference === 0) return clock(date)
  if (dayDifference === 1) return '昨天'
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function compareNumericIds(left: string, right: string) { return left.length - right.length || left.localeCompare(right) }

export function sortMessagesChronologically<T extends Timestamped>(messages: T[]) {
  return messages.map((message, index) => ({ message, index, timestamp: parsedTime(message.createdAt) }))
    .sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) return left.timestamp - right.timestamp
      if (/^\d+$/u.test(left.message.id) && /^\d+$/u.test(right.message.id)) return compareNumericIds(left.message.id, right.message.id)
      return left.index - right.index
    })
    .map(({ message }) => message)
}

export function mergeMessagesChronologically<T extends Timestamped>(existing: T[], incoming: T[]) {
  const merged = new Map(existing.map((message) => [message.id, message]))
  incoming.forEach((message) => merged.set(message.id, message))
  return sortMessagesChronologically([...merged.values()])
}
