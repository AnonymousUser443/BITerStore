import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Avatar } from '@/components/ui'
import { Glyph, type GlyphName } from '@/components/Glyph'
import { demoRepository, getUser } from '@/domain/repository'
import type { ChatThread, Notification } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const noticeGlyphs: Record<Notification['type'], GlyphName> = { like: 'heart', comment: 'message', system: 'bell', follow: 'user' }

export default function MessagesPage() {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [notices, setNotices] = useState<Notification[]>([])
  const load = useCallback(() => Promise.all([demoRepository.listThreads(), demoRepository.listNotifications()]).then(([a, b]) => { setThreads(a); setNotices(b) }), [])
  useDidShow(() => { void load() })
  return <AppShell title='消息' active='messages' className='messages-page'>
    <View className='notification-grid'>{notices.map((notice) => <Button id={`e2e-notification-${notice.type}`} key={notice.id} onClick={() => navigationAdapter.go(`/pages/notification/detail?type=${notice.type}`)}><View className={`notice-icon ${notice.type}`}><Glyph name={noticeGlyphs[notice.type]} /></View><View className='notice-copy'><Text className='notice-title'>{notice.title}</Text><Text className='notice-subtitle'>{notice.subtitle}</Text><Text className='notice-link'>点击查看详情</Text></View><Glyph name='chevron' className='notice-chevron' />{notice.unread > 0 && <Text className='notice-count'>{notice.unread}</Text>}</Button>)}</View>
    <View className='section-title message-title'><Text className='section-heading-text'>私聊消息</Text><Text className='all-read'>✓ 全部已读</Text></View>
    <View className='thread-list'>{threads.map((thread) => { const user = getUser(thread.participantId); const last = thread.messages.at(-1); return <Button id={`e2e-thread-${thread.id}`} key={thread.id} onClick={() => navigationAdapter.go(`/pages/chat/index?id=${thread.id}`)}><Avatar user={user} size={54} /><View className='thread-copy'><Text className='thread-name'>{user.name}<Text className='thread-campus'>{user.campus}校区</Text></Text><Text className='thread-message'>{last?.text || '从一本书开始聊聊吧'}</Text></View><Text className='thread-time'>{thread.updatedAt}</Text>{thread.unread > 0 && <Text className='thread-unread'>{thread.unread}</Text>}</Button> })}</View>
    <View className='tobby-banner'><Image className='tobby-banner-image' src='/assets/tobby-hello.webp' mode='aspectFit' /><Text className='tobby-banner-copy'><Text>Tobby 提醒：</Text>及时回复消息，能提升成交率哦～</Text></View>
  </AppShell>
}
