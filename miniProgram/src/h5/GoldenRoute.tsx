import { MobileApp } from '../../../web/app/components/mobile-app'

function goldenPath() {
  const url = new URL(globalThis.location.href)
  const path = url.pathname
  if (path === '/welcome') return '/'
  if (path === '/search' || path === '/category') return `/category${url.search}`
  if (path === '/books') return `/books/${url.searchParams.get('id') || 'math-7'}`
  if (path === '/notifications') return `/messages/notifications/${url.searchParams.get('type') || 'system'}`
  if (path === '/chat') return `/messages/${url.searchParams.get('id') || 'thread-lin'}`
  if (path === '/states') {
    const type = url.searchParams.get('type')
    return !type || type === 'index' ? '/states' : `/states/${type === 'not-found' ? '404' : type}`
  }
  return path
}

export default function GoldenRoute() {
  return <MobileApp initialPath={goldenPath()} />
}
