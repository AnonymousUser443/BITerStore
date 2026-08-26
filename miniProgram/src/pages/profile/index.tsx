import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Tobby } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import type { User } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

export default function ProfilePage() {
  const [user, setUser] = useState<User>()
  const [counts, setCounts] = useState([0, 0, 0])
  const load = useCallback(() => Promise.all([demoRepository.getProfile(), demoRepository.listFavorites(), demoRepository.listMyListings(), demoRepository.listThreads()]).then(([profile, favorites, listings, threads]) => { setUser(profile); setCounts([favorites.length, listings.length, threads.length]) }), [])
  useDidShow(() => { void load() })
  const reset = async () => { if (await feedbackAdapter.confirm('重置演示数据', '将清理 Taro 新版中的收藏、草稿、消息和图片，不影响旧 H5。')) { await demoRepository.resetDemoData(); await feedbackAdapter.toast('演示数据已重置'); await load() } }

  return <AppShell title='我的' active='profile' className='profile-page'>
    <View className='profile-hero'><Image className='profile-avatar' mode='aspectFill' src={user?.avatar || '/assets/avatar-zhou.webp'} /><View className='profile-copy'><Text className='profile-name'>{user?.name || '北理小书童'} <Glyph name='shield' /></Text><View className='profile-badges'><Text>LV.12 · 书海漫游者</Text><Text>◉ 学生认证</Text></View><Text>{user?.campus || '良乡'}校区 · 北京理工大学</Text><Text>{user?.bio || '愿每一本书都能遇见新的读者。'}</Text></View><Button className='profile-settings'>⚙</Button></View>
    <View className='profile-stats'><Button onClick={() => navigationAdapter.go('/pages/favorites/index')}><Text>{counts[0]}</Text><Text>我的收藏</Text></Button><Button onClick={() => navigationAdapter.go('/pages/my-listings/index')}><Text>{counts[1]}</Text><Text>我的发布</Text></Button><Button><Text>12</Text><Text>校园信用</Text></Button></View>
    <View className='profile-reminder'><Tobby mood='cheer' /><Text><Text>Tobby 提醒：</Text>让闲置继续流动，也会遇见更多书友。</Text><Button onClick={() => navigationAdapter.go('/pages/states/index?type=index')}>去逛逛 <Glyph name='chevron' /></Button></View>
    <View className='profile-menu-grid'>
      <View className='profile-menu'><Text className='menu-title'>书籍管理</Text><Button onClick={() => navigationAdapter.go('/pages/my-listings/index')}><Glyph name='book' /><View><Text>我的发布</Text><Text>在售、已售、草稿与下架</Text></View><Glyph name='chevron' /></Button><Button onClick={() => navigationAdapter.go('/pages/favorites/index')}><Glyph name='heart' /><View><Text>我的收藏</Text><Text>把想看的书放在这里</Text></View><Glyph name='chevron' /></Button></View>
      <View className='profile-menu'><Text className='menu-title'>体验与帮助</Text><Button onClick={() => navigationAdapter.go('/pages/onboarding/index')}><Glyph name='refresh' /><View><Text>重新观看新手指引</Text><Text>再次认识搜索、商品卡与发布</Text></View><Glyph name='chevron' /></Button><Button onClick={() => navigationAdapter.go('/pages/states/index?type=index')}><Glyph name='sparkle' /><View><Text>演示与状态</Text><Text>查看空状态、错误、维护等页面</Text></View><Glyph name='chevron' /></Button><Button id='e2e-profile-reset' className='danger' onClick={reset}><Glyph name='refresh' /><View><Text>重置演示数据</Text><Text>清空收藏、草稿、发布与消息变化</Text></View><Glyph name='chevron' /></Button></View>
    </View>
  </AppShell>
}
