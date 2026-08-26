import Taro from '@tarojs/taro'

export const routes = {
  welcome: '/pages/welcome/index',
  onboarding: '/pages/onboarding/index',
  home: '/pages/home/index',
  search: '/pages/search/index',
  bookDetail: '/pages/book-detail/index',
  publish: '/pages/publish/index',
  messages: '/pages/messages/index',
  notificationDetail: '/pages/notification-detail/index',
  chat: '/pages/chat/index',
  profile: '/pages/profile/index',
  favorites: '/pages/favorites/index',
  myListings: '/pages/my-listings/index',
  states: '/pages/states/index',
  notFound: '/pages/not-found/index',
} as const

const tabRoutes = new Set<string>([routes.home, routes.search, routes.publish, routes.messages, routes.profile])

export interface NavigationAdapter {
  to(path: string, query?: Record<string, string>): Promise<void>
  replace(path: string, query?: Record<string, string>): Promise<void>
  back(fallback?: string): Promise<void>
}

const buildUrl = (path: string, query?: Record<string, string>) => {
  const search = query
    ? Object.entries(query).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
    : ''
  return search ? `${path}?${search}` : path
}

export const navigationAdapter: NavigationAdapter = {
  async to(path, query) {
    const url = buildUrl(path, query)
    if (tabRoutes.has(path) && !query) await Taro.switchTab({ url })
    else await Taro.navigateTo({ url })
  },
  async replace(path, query) {
    const url = buildUrl(path, query)
    if (tabRoutes.has(path) && !query) await Taro.switchTab({ url })
    else await Taro.redirectTo({ url })
  },
  async back(fallback = routes.home) {
    const pages = Taro.getCurrentPages()
    if (pages.length > 1) await Taro.navigateBack()
    else await this.replace(fallback)
  },
}

export function navigateTarget(target: string): Promise<void> {
  const [kind, id] = target.split(':')
  if (kind === 'book') return navigationAdapter.to(routes.bookDetail, { id })
  if (kind === 'chat') return navigationAdapter.to(routes.chat, { id })
  if (kind === 'state') return navigationAdapter.to(routes.states, { type: id })
  if (target === 'favorites') return navigationAdapter.to(routes.favorites)
  if (target === 'profile') return navigationAdapter.to(routes.profile)
  return navigationAdapter.to(routes.home)
}
