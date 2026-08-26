import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { useState } from 'react'
import './index.css'

const tabs = [['/pages/home/index', '⌂', '首页'], ['/pages/search/index', '⌕', '搜索'], ['/pages/publish/index', '＋', '发布'], ['/pages/messages/index', '✉', '消息'], ['/pages/profile/index', '○', '我的']]
export default function CustomTabBar() { const [route, setRoute] = useState(''); useDidShow(() => setRoute(`/${Taro.getCurrentInstance().router?.path || ''}`)); return <View className='custom-tabbar'>{tabs.map(([url, icon, label]) => <Button id={`e2e-nav-${label === '首页' ? 'home' : label === '搜索' ? 'search' : label === '发布' ? 'publish' : label === '消息' ? 'messages' : 'profile'}`} key={url} className={`${route === url ? 'active' : ''} ${label === '发布' ? 'publish' : ''}`} onClick={() => Taro.switchTab({ url })}><Text>{icon}</Text><Text>{label}</Text></Button>)}</View> }
