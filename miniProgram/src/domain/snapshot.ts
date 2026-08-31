export function preserveSnapshot<T>(current: T, next: T): T {
  if (current === next) return current
  try { return JSON.stringify(current) === JSON.stringify(next) ? current : next } catch { return next }
}
