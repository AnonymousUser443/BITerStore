import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { useState } from 'react'
import { Glyph, type GlyphName } from '@/components/Glyph'
import './index.css'

const tabs: ReadonlyArray<readonly [string, GlyphName, string, string]> = [['/pages/home/index', 'home', '首页', 'home'], ['/pages/search/index', 'search', '分类', 'search'], ['/pages/publish/index', 'publish', '发布', 'publish'], ['/pages/messages/index', 'message', '消息', 'messages'], ['/pages/profile/index', 'user', '我的', 'profile']]
export default function CustomTabBar() { const [route, setRoute] = useState(''); useDidShow(() => setRoute(`/${Taro.getCurrentInstance().router?.path || ''}`)); return <View className='custom-tabbar'>{tabs.map(([url, glyph, label, key]) => <Button id={`e2e-nav-${key}`} key={url} className={`${route === url ? 'active' : ''} ${label === '发布' ? 'publish' : ''}`} onClick={() => Taro.switchTab({ url })}><Glyph name={glyph} /><Text>{label}</Text></Button>)}</View> }
