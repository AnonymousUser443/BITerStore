import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { AppShell, Avatar, BookCover } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository, getUser } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import { CURRENT_USER_ID, seedListings } from '@/domain/seed'
import type { ChatThread } from '@/domain/types'
import { mediaAdapter } from '@/platform'

export default function ChatPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'thread-lin'
  const [thread, setThread] = useState<ChatThread>()
  const [text, setText] = useState('')
  const load = useCallback(() => demoRepository.getThread(id).then(setThread), [id])
  useEffect(() => { void requireAccount('登录后才能使用私聊').then((allowed) => allowed && load()) }, [load])
  const send = async () => { if (!text.trim()) return; await demoRepository.sendMessage(id, text.trim()); setText(''); await load() }
  const sendImage = async () => { const files = await mediaAdapter.persist(await mediaAdapter.pick()); if (files[0]) { await demoRepository.sendMessage(id, '[图片]', files[0].id); await load() } }
  const user = thread ? getUser(thread.participantId) : undefined
  const listing = seedListings.find((item) => item.id === thread?.listingId) || seedListings[0]
  return <AppShell title={user?.name || '消息'} back noNav className='chat-page'>
    {user && <View className='chat-user'><Avatar user={user} size={40} /><Text>{user.campus}校区 · 在线</Text></View>}
    <View className='chat-safety'><Glyph name='shield' />站内沟通更安全 · 当面交易请确认书况</View>
    <View className='message-stream'>{thread?.messages.map((message) => { const mine = message.senderId === CURRENT_USER_ID; return <View className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>{!mine && user && <Avatar user={user} size={37} />}<View className='message-content'>{message.kind === 'listing' && <Button className='shared-book'><BookCover listing={listing} compact /><View><Text className='shared-title'>{listing.title}</Text><Text className='shared-author'>{listing.author}</Text><Text className='shared-price'>¥{listing.price}</Text></View></Button>}<Text className='message-bubble'>{message.text}</Text><Text className='message-time'>{message.createdAt}</Text></View>{mine && <Avatar user={getUser(CURRENT_USER_ID)} size={37} />}</View> })}</View>
    <View className='trade-tip'>❧ 交易小贴士：请在校内当面交易，确认书况后再付款哦～ ❧</View>
    <View className='chat-composer'><Button id='e2e-message-image' onClick={sendImage}><Glyph name='image' /></Button><Button><Glyph name='bookmark' /></Button><Input id='e2e-message-input' value={text} onInput={(event) => setText(event.detail.value)} onConfirm={send} placeholder='输入消息…' /><Button id='e2e-message-send' className='send-button' onClick={send}>发送</Button></View>
  </AppShell>
}
