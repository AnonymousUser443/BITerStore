import { View } from '@tarojs/components'

import { navigationAdapter, routes } from '../../platform/navigation'
import { Glyph } from '../Glyph'
import type { GlyphName } from '../Glyph'

export type NavKey = 'home' | 'search' | 'publish' | 'messages' | 'profile'

export const navItems: Array<{ key: NavKey; label: string; route: string; glyph: GlyphName; primary?: boolean }> = [
  { key: 'home', label: '首页', route: routes.home, glyph: 'home' },
  { key: 'search', label: '搜索', route: routes.search, glyph: 'search' },
  { key: 'publish', label: '发布', route: routes.publish, glyph: 'publish', primary: true },
  { key: 'messages', label: '消息', route: routes.messages, glyph: 'message' },
  { key: 'profile', label: '我的', route: routes.profile, glyph: 'user' },
]

export function BottomNav({ active }: { active?: NavKey }) {
  return (
    <View className='bottom-nav' role='navigation' aria-label='主导航'>
      {navItems.map((item) => (
        <View
          id={`e2e-nav-${item.key}`}
          className={`nav-item ${active === item.key ? 'active' : ''} ${item.primary ? 'publish' : ''}`}
          onClick={() => navigationAdapter.to(item.route)}
          key={item.key}
        >
          <Glyph name={item.glyph} /><View>{item.label}</View>
        </View>
      ))}
    </View>
  )
}
