import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { useState } from 'react'
import './index.css'

const tabs = [['/pages/home/index', 'home', '首页', 'home'], ['/pages/search/index', 'grid', '分类', 'search'], ['/pages/publish/index', 'send', '发布', 'publish'], ['/pages/messages/index', 'chat', '消息', 'messages'], ['/pages/profile/index', 'user', '我的', 'profile']] as const
export default function CustomTabBar() { const [route, setRoute] = useState(''); useDidShow(() => setRoute(`/${Taro.getCurrentInstance().router?.path || ''}`)); return <View className='custom-tabbar'>{tabs.map(([url, icon, label, key]) => <Button id={`e2e-nav-${key}`} key={url} className={`${route === url ? 'active' : ''} ${key === 'publish' ? 'publish' : ''}`} onClick={() => Taro.switchTab({ url })}><View className={`nav-icon ${icon}`} /><Text>{label}</Text></Button>)}</View> }
