import { useCallback, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell } from '@/components/ui'
import { demoRepository, getUser } from '@/domain/repository'
import type { ChatThread, Notification } from '@/domain/types'
import { navigationAdapter } from '@/platform'

export default function MessagesPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]); const [notices, setNotices] = useState<Notification[]>([])
  const load = useCallback(() => Promise.all([demoRepository.listThreads(), demoRepository.listNotifications()]).then(([a, b]) => { setThreads(a); setNotices(b) }), []); useDidShow(() => { void load() })
  return <AppShell title='消息'><View className='section-row'><Text className='section-title'>通知</Text></View>{notices.map((notice) => <Button id={`e2e-notification-${notice.id}`} key={notice.id} className='notice-row' onClick={() => navigationAdapter.go(`/pages/notification/detail?type=${notice.type}`)}><Text>{notice.type === 'system' ? '盾' : '铃'}</Text><View className='grow'><Text>{notice.title}</Text><Text className='muted'>{notice.subtitle}</Text></View>{notice.unread > 0 && <Text className='status-tag'>{notice.unread}</Text>}</Button>)}<View className='section-row'><Text className='section-title'>最近会话</Text></View>{threads.map((thread) => { const user = getUser(thread.participantId); return <Button id={`e2e-thread-${thread.id}`} key={thread.id} className='thread-row' onClick={() => navigationAdapter.go(`/pages/chat/index?id=${thread.id}`)}><View className='avatar' /><View className='grow'><Text>{user.name}</Text><Text className='muted'>{thread.messages.at(-1)?.text || '开始聊聊这本书'}</Text></View><Text>{thread.unread ? `${thread.unread} 条` : thread.updatedAt}</Text></Button> })}</AppShell>
}
