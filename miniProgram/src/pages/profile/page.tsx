import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Avatar } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import { bindWechat, logout } from '@/domain/auth'
import { requireAccount } from '@/domain/access'
import type { User } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

export default function ProfilePage() {
  const [user, setUser] = useState<User>()
  const [counts, setCounts] = useState([0, 0, 0])
  const load = useCallback(() => Promise.all([demoRepository.getProfile(), demoRepository.listFavorites(), demoRepository.listMyListings(), demoRepository.listThreads()]).then(([profile, favorites, listings, threads]) => { setUser(profile); setCounts([favorites.length, listings.length, threads.length]) }), [])
  useDidShow(() => { void requireAccount('请先使用学号登录后查看“我的”').then((allowed) => allowed && load()) })
  const bindCurrentWechat = async () => {
    try {
      await bindWechat()
      await feedbackAdapter.toast('微信绑定成功')
      await load()
    } catch (cause) {
      await feedbackAdapter.toast(cause instanceof Error ? cause.message : '微信绑定失败')
    }
  }
  const reset = async () => { if (__BITERSTORE_E2E__ || await feedbackAdapter.confirm('重置演示数据', '将清理 Taro 新版中的收藏、草稿、消息和图片，不影响旧 H5。')) { await demoRepository.resetDemoData(); await feedbackAdapter.toast('演示数据已重置'); await load() } }
  if (!user) return <AppShell active='profile'><View className='empty'>托比正在准备个人主页…</View></AppShell>

  return <AppShell title='我的' active='profile' className='profile-page'>
    <View className='profile-hero'><Avatar user={user} size={86} /><View className='profile-copy'><Text className='profile-name'>{user.name} {user.verified && <Glyph name='shield' />}</Text><View className='profile-badges'><Text>书海漫游者</Text><Text><Glyph name='shield' /> {user.verified ? '北京理工大学认证用户' : '校园身份未认证'}</Text></View><Text className='profile-campus'>{user.campus}校区{user.verified ? ' · 北京理工大学' : ''}</Text><Text className='profile-bio'>{user.bio}</Text></View><Button className='profile-settings'><Glyph name='settings' /></Button></View>
    <View className='profile-stats'><Button onClick={() => navigationAdapter.go('/pages/favorites/index')}><Text className='profile-stat-value'>{counts[0]}</Text><Text className='profile-stat-label'>我的收藏</Text></Button><Button onClick={() => navigationAdapter.go('/pages/my-listings/index')}><Text className='profile-stat-value'>{counts[1]}</Text><Text className='profile-stat-label'>我的发布</Text></Button><Button><Text className='profile-stat-value'>12</Text><Text className='profile-stat-label'>校园信用</Text></Button></View>
    <View className='profile-reminder'><Image className='profile-reminder-image' src='/assets/tobby-heart.webp' mode='aspectFit' /><Text className='profile-reminder-copy'><Text>Tobby 提醒：</Text>让闲置继续流动，也会遇见更多书友。</Text><Button onClick={() => navigationAdapter.switchTab('/pages/search/index')}>去逛逛 <Glyph name='chevron' /></Button></View>
    <View className='profile-menu'><Text className='menu-title'>书籍管理</Text><MenuButton glyph='book' label='我的发布' detail='在售、已售、草稿与下架' onClick={() => navigationAdapter.go('/pages/my-listings/index')} /><MenuButton glyph='heart' label='我的收藏' detail='把想看的书放在这里' onClick={() => navigationAdapter.go('/pages/favorites/index')} /></View>
    <View className='profile-menu'><Text className='menu-title'>体验与帮助</Text><MenuButton glyph='refresh' label='重新观看新手指引' detail='再次认识搜索、商品卡与发布' onClick={() => navigationAdapter.go('/pages/onboarding/index')} /><MenuButton glyph='sparkle' label='演示与状态' detail='查看空状态、错误、维护等页面' onClick={() => navigationAdapter.go('/pages/states/index?type=index')} /><MenuButton id='e2e-profile-reset' glyph='refresh' label='重置演示数据' detail='清空收藏、草稿、发布与消息变化' onClick={reset} danger /></View>
    <View className='profile-menu'><Text className='menu-title'>账号与安全</Text>{process.env.TARO_ENV === 'weapp' && !user.wechatBound && <MenuButton glyph='sparkle' label='绑定微信' detail='绑定后可使用微信快捷登录；学号仍是主要账号' onClick={bindCurrentWechat} />}{user.wechatBound && <MenuButton glyph='sparkle' label='微信已绑定' detail='当前微信可用于快捷登录' onClick={() => feedbackAdapter.toast('微信已绑定')} />}<MenuButton glyph='refresh' label='退出当前账号' detail='退出后仍可使用游客模式浏览商品' onClick={async () => { await logout(); await demoRepository.clearAuthentication(); await navigationAdapter.go('/pages/login/index') }} danger /></View>
  </AppShell>
}

function MenuButton({ glyph, label, detail, onClick, danger = false, id }: { glyph: 'book' | 'heart' | 'refresh' | 'sparkle'; label: string; detail: string; onClick: () => void; danger?: boolean; id?: string }) {
  return <Button id={id} className={danger ? 'danger' : ''} onClick={onClick}><Text className='menu-icon'><Glyph name={glyph} /></Text><View><Text className='menu-label'>{label}</Text><Text className='menu-detail'>{detail}</Text></View><Glyph name='chevron' /></Button>
}
