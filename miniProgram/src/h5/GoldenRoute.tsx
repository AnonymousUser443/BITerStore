import { useLayoutEffect } from 'react'
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
  useLayoutEffect(() => {
    const resetScroll = () => {
      globalThis.scrollTo(0, 0)
      document.querySelectorAll<HTMLElement>('.taro_router, .taro_page, .content-scroll').forEach((element) => { element.scrollTop = 0 })
    }
    resetScroll()
    const frame = globalThis.requestAnimationFrame(resetScroll)
    return () => globalThis.cancelAnimationFrame(frame)
  }, [])
  return <MobileApp initialPath={goldenPath()} />
}
