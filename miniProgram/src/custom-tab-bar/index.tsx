import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { Glyph, type GlyphName } from '@/components/Glyph'
import './index.css'

const tabs: ReadonlyArray<readonly [string, GlyphName, string, string]> = [
  ['/pages/home/index', 'home', '首页', 'home'],
  ['/pages/search/index', 'search', '搜索', 'search'],
  ['/pages/publish/index', 'publish', '发布', 'publish'],
  ['/pages/messages/index', 'message', '消息', 'messages'],
  ['/pages/profile/index', 'user', '我的', 'profile']
]

export default function CustomTabBar() {
  const [route, setRoute] = useState('')
  useDidShow(() => setRoute(`/${Taro.getCurrentInstance().router?.path || ''}`))
  return <View className='custom-tabbar'>{tabs.map(([url, icon, label, key]) => <Button
    id={`e2e-nav-${key}`}
    key={url}
    className={`nav-item ${route === url ? 'active' : ''} ${key === 'publish' ? 'publish' : ''}`}
    onClick={() => Taro.switchTab({ url })}
  >
    <View className='nav-icon'><Glyph name={icon} /></View>
    <Text className='nav-label'>{label}</Text>
  </Button>)}</View>
}
