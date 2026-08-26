import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, Tobby } from '@/components/ui'
import { Glyph, type GlyphName } from '@/components/Glyph'
import { demoRepository, getUser } from '@/domain/repository'
import type { ChatThread, Notification } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const noticeTypes: ReadonlyArray<readonly [Notification['type'], string, string, GlyphName]> = [['like', '收到的赞', '看看谁喜欢你的书', 'heart'], ['comment', '评论与回复', '商品咨询与留言', 'message'], ['system', '系统通知', '交易安全与平台提醒', 'shield'], ['follow', '新的关注', '认识更多校园书友', 'user']]

export default function MessagesPage() {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [notices, setNotices] = useState<Notification[]>([])
  const load = useCallback(() => Promise.all([demoRepository.listThreads(), demoRepository.listNotifications()]).then(([a, b]) => { setThreads(a); setNotices(b) }), [])
  useDidShow(() => { void load() })
  return <AppShell title='消息' active='messages' className='messages-page'>
    <View className='notification-grid'>{noticeTypes.map(([type, title, subtitle, glyph]) => { const unread = notices.filter((notice) => notice.type === type).reduce((sum, notice) => sum + notice.unread, 0); return <Button id={`e2e-notification-${type}`} key={type} onClick={() => navigationAdapter.go(`/pages/notification/detail?type=${type}`)}><View className='notice-icon'><Glyph name={glyph} /></View><View><Text>{title}</Text><Text>{subtitle}</Text><Text>查看通知</Text></View>{unread > 0 && <Text className='unread-badge'>{unread}</Text>}<Glyph name='chevron' className='notice-chevron' /></Button> })}</View>
    <View className='tobby-banner'><Tobby mood='news' /><Text><Text>Tobby 提醒：</Text>沟通书况、版本与见面地点时，尽量留在站内。</Text></View>
    <View className='section-heading'><Text className='section-title'>最近会话</Text><Text className='section-note'>全部标为已读</Text></View>
    <View className='thread-list'>{threads.map((thread) => { const user = getUser(thread.participantId); return <Button id={`e2e-thread-${thread.id}`} key={thread.id} onClick={() => navigationAdapter.go(`/pages/chat/index?id=${thread.id}`)}><Image className='thread-avatar' src={user.avatar || '/assets/avatar-lin.webp'} mode='aspectFill' /><View><Text>{user.name}<Text>《{thread.listingId === 'data-c' ? '数据结构' : '校园教材'}》</Text></Text><Text>{thread.messages.at(-1)?.text || '开始聊聊这本书'}</Text></View><Text>{thread.updatedAt}</Text>{thread.unread > 0 && <Text className='unread-badge'>{thread.unread}</Text>}</Button> })}</View>
  </AppShell>
}
