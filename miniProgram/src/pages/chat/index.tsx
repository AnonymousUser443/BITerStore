import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { AppShell } from '@/components/ui'
import { demoRepository, getUser } from '@/domain/repository'
import { CURRENT_USER_ID } from '@/domain/seed'
import type { ChatThread } from '@/domain/types'
import { mediaAdapter } from '@/platform'

export default function ChatPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'thread-lin'; const [thread, setThread] = useState<ChatThread>(); const [text, setText] = useState('')
  const load = useCallback(() => demoRepository.getThread(id).then(setThread), [id]); useEffect(() => { void load() }, [load])
  const send = async () => { if (!text.trim()) return; await demoRepository.sendMessage(id, text.trim()); setText(''); await load() }
  const sendImage = async () => { const files = await mediaAdapter.persist(await mediaAdapter.pick()); if (files[0]) { await demoRepository.sendMessage(id, '[图片]', files[0].id); await load() } }
  const user = thread ? getUser(thread.participantId) : undefined
  return <AppShell title={user?.name || '聊天'} back><View className='inline-toast'>为了安全，请勿提前转账，建议在校内公共区域当面验书。</View><View className='chat-list'>{thread?.messages.map((message) => <View key={message.id} className={`bubble ${message.senderId === CURRENT_USER_ID ? 'mine' : ''}`}><Text>{message.text}</Text><Text className='muted'>{message.createdAt}</Text></View>)}</View><View className='composer'><Button id='e2e-message-image' onClick={sendImage}>＋</Button><Input id='e2e-message-input' value={text} onInput={(e) => setText(e.detail.value)} placeholder='输入消息' /><Button id='e2e-message-send' onClick={send}>发送</Button></View></AppShell>
}
