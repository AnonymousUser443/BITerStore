import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Tobby } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import type { User } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

export default function ProfilePage() {
  const [user, setUser] = useState<User>(); const [counts, setCounts] = useState([0, 0, 0]); const load = useCallback(() => Promise.all([demoRepository.getProfile(), demoRepository.listFavorites(), demoRepository.listMyListings(), demoRepository.listThreads()]).then(([profile, favorites, listings, threads]) => { setUser(profile); setCounts([favorites.length, listings.length, threads.length]) }), []); useDidShow(() => { void load() })
  const reset = async () => { if (await feedbackAdapter.confirm('重置演示数据', '将清理 Taro 新版中的收藏、草稿、消息和图片，不影响旧 H5。')) { await demoRepository.resetDemoData(); await feedbackAdapter.toast('演示数据已重置'); await load() } }
  return <AppShell title='我的'><View className='paper-card profile-hero'><Image className='avatar' mode='aspectFill' src={user?.avatar || '/assets/avatar-zhou.webp'} /><Text className='section-title'>{user?.name || '北理书友'} · 已认证</Text><Text className='muted'>{user?.campus}校区 · {user?.bio}</Text><View className='stats'><View className='stat'><Text><strong>{counts[0]}</strong>收藏</Text></View><View className='stat'><Text><strong>{counts[1]}</strong>发布</Text></View><View className='stat'><Text><strong>{counts[2]}</strong>会话</Text></View></View></View><View className='section-row'><Text className='section-title'>我的书架</Text></View><View className='menu-grid'><Button className='menu-row' onClick={() => navigationAdapter.go('/pages/favorites/index')}><Text className='grow'>我的收藏</Text><Text>›</Text></Button><Button className='menu-row' onClick={() => navigationAdapter.go('/pages/my-listings/index')}><Text className='grow'>我的发布</Text><Text>›</Text></Button><Button className='menu-row' onClick={() => navigationAdapter.go('/pages/states/index?type=index')}><Text className='grow'>状态体验</Text><Text>›</Text></Button><Button className='menu-row' onClick={() => navigationAdapter.go('/pages/onboarding/index')}><Text className='grow'>重播新手引导</Text><Text>›</Text></Button><Button id='e2e-profile-reset' className='menu-row' onClick={reset}><Text className='grow'>重置演示数据</Text><Text>↻</Text></Button></View><Tobby mood='cheer' caption='让每一本书继续被需要' /></AppShell>
}
