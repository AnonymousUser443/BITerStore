import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { bundledAsset } from '@/assets'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Avatar } from '@/components/ui'
import { Glyph, type GlyphName } from '@/components/Glyph'
import { formatThreadTime } from '@/domain/date-time'
import { demoRepository, getUser } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import { preserveSnapshot } from '@/domain/snapshot'
import type { ChatThread, Notification } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const noticeGlyphs: Record<Notification['type'], GlyphName> = { like: 'heart', comment: 'message', system: 'bell', follow: 'user' }

export default function MessagesPage() {
  const [threads, setThreads] = useState<ChatThread[]>(() => demoRepository.peekThreads() || [])
  const [notices, setNotices] = useState<Notification[]>(() => demoRepository.peekNotifications() || [])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const load = useCallback(() => { void demoRepository.listThreadsPage().then((page) => { setThreads((current) => preserveSnapshot(current, page.items)); setNextCursor(page.nextCursor) }); void demoRepository.listNotifications().then((next) => setNotices((current) => preserveSnapshot(current, next))) }, [])
  useDidShow(() => { void requireAccount('登录后才能查看消息').then((allowed) => { if (allowed) return load() }) })
  return <AppShell title='消息' active='messages' className='messages-page'>
    <View className='notification-grid'>{notices.map((notice) => <Button id={`e2e-notification-${notice.type}`} key={notice.id} onClick={() => navigationAdapter.go(`/pages/notification/detail?type=${notice.type}`)}><View className={`notice-icon ${notice.type}`}><Glyph name={noticeGlyphs[notice.type]} /></View><View className='notice-copy'><Text className='notice-title'>{notice.title}</Text><Text className='notice-subtitle'>{notice.subtitle}</Text><Text className='notice-link'>点击查看详情</Text></View><Glyph name='chevron' className='notice-chevron' />{notice.unread > 0 && <Text className='notice-count'>{notice.unread}</Text>}</Button>)}</View>
    <View className='section-title message-title'><Text className='section-heading-text'>私聊消息</Text><Text className='all-read'>✓ 站内消息</Text></View>
    <View className='thread-list'>{threads.map((thread) => { const user = thread.participant || getUser(thread.participantId); const last = thread.messages.at(-1); const campus = user.campus === '未设置' ? '校区未设置' : `${user.campus}校区`; return <Button id={`e2e-thread-${thread.id}`} key={thread.id} onClick={() => navigationAdapter.go(`/pages/chat/index?id=${thread.id}`)}><Avatar user={user} size={54} /><View className='thread-copy'><Text className='thread-name'>{user.name}<Text className='thread-campus'>{campus}</Text></Text><Text className={`thread-message ${thread.unread > 0 ? 'unread-preview' : ''}`}>{thread.unread > 0 ? '新消息 · ' : ''}{thread.blocked ? '[已拉黑] ' : ''}{last?.text || (thread.listing ? `我想咨询《${thread.listing.title}》` : '从一本书开始聊聊吧')}</Text></View><Text className='thread-time'>{formatThreadTime(thread.updatedAt)}</Text>{thread.unread > 0 && <Text className='thread-unread'>{thread.unread}</Text>}</Button> })}</View>
    {nextCursor && <Button className='secondary-button catalog-load-more' disabled={loadingMore} onClick={async () => { if (loadingMore) return; setLoadingMore(true); try { const page = await demoRepository.listThreadsPage(nextCursor); setThreads(page.items); setNextCursor(page.nextCursor) } finally { setLoadingMore(false) } }}>{loadingMore ? '正在加载…' : '加载更多会话'}</Button>}
    {threads.length === 0 && <View className='inline-state'><Image src={bundledAsset('tobby-question')} mode='aspectFit' /><Text className='inline-title'>还没有私聊消息</Text><Text className='inline-copy'>从一本感兴趣的书开始聊聊吧。</Text></View>}<View className='tobby-banner'><Image className='tobby-banner-image' src={bundledAsset('tobby-hello')} mode='aspectFit' /><Text className='tobby-banner-copy'><Text>Tobby 提醒：</Text>及时回复消息，能提升成交率哦～</Text></View>
  </AppShell>
}
