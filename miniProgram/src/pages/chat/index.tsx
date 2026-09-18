import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Text, View } from '@tarojs/components'
import { AppShell, Avatar, BookCover } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { formatMessageTime } from '@/domain/date-time'
import { demoRepository, getUser } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import { CURRENT_USER_ID, seedListings } from '@/domain/seed'
import type { ChatThread, User } from '@/domain/types'
import { feedbackAdapter, mediaAdapter, navigationAdapter } from '@/platform'

export default function ChatPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'thread-lin'
  const [thread, setThread] = useState<ChatThread | null | undefined>()
  const [currentUserId, setCurrentUserId] = useState(() => demoRepository.peekProfile()?.id || CURRENT_USER_ID)
  const [currentUser, setCurrentUser] = useState<User>(() => demoRepository.peekProfile() || getUser(CURRENT_USER_ID))
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const load = useCallback(async () => {
    const loaded = await demoRepository.getThread(id)
    const blockedUsers = await demoRepository.listBlockedUsers()
    return { ...loaded, blocked: Boolean(loaded.blocked || blockedUsers.some((item) => item.id === loaded.participantId)) }
  }, [id])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setInterval> | undefined
    void (async () => {
      const allowed = await requireAccount('登录后才能使用私聊')
      if (!allowed || !active) return
      void demoRepository.getProfile().then((profile) => { if (active) { setCurrentUserId(profile.id); setCurrentUser(profile) } }).catch(() => undefined)
      try {
        const loaded = await load()
        if (!active) return
        setThread(loaded)
        timer = setInterval(() => { void load().then((next) => { if (active) setThread(next) }).catch(() => undefined) }, 6000)
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : '会话加载失败，请稍后重试')
        setThread(null)
      }
    })()
    return () => { active = false; if (timer) clearInterval(timer) }
  }, [attempt, load])
  const send = async () => { if (!text.trim() || !thread || thread.blocked) return; try { await demoRepository.sendMessage(id, text.trim()); setText(''); setThread(await load()) } catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '消息发送失败') } }
  const sendImage = async () => { if (__API_URL__ && !__BITERSTORE_E2E__) return feedbackAdapter.toast('图片消息暂未开放'); const files = await mediaAdapter.persist(await mediaAdapter.pick()); if (files[0]) { await demoRepository.sendMessage(id, '[图片]', files[0].id); await load() } }
  const user = thread ? thread.participant || getUser(thread.participantId) : undefined
  const listing = thread?.listing || demoRepository.peekListing(thread?.listingId || '') || seedListings.find((item) => item.id === thread?.listingId) || { ...seedListings[0], id: thread?.listingId || seedListings[0].id, title: '会话关联商品' }
  const contextMine = !thread?.buyerId || thread.buyerId === currentUserId
  const scrollAnchor = `chat-stream-end-${thread?.messages.length || 0}`
  const toggleBlocked = async () => {
    if (!thread) return
    const next = !thread.blocked
    if (next && !await feedbackAdapter.confirm('拉黑用户', '拉黑后双方无法继续发送消息，历史消息仍会保留。')) return
    try { await demoRepository.setBlocked(thread.participantId, next); setThread({ ...thread, blocked: next }); await feedbackAdapter.toast(next ? '已拉黑该用户' : '已解除拉黑') }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '拉黑操作失败') }
  }
  const loadOlder = async () => {
    if (!thread?.olderCursor || loadingOlder) return
    setLoadingOlder(true)
    try { await demoRepository.loadOlderMessages(thread.id, thread.olderCursor); const next = demoRepository.peekThread(thread.id); if (next) setThread(next) }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '历史消息加载失败') }
    finally { setLoadingOlder(false) }
  }
  const composer = thread?.blocked
    ? <View className='chat-composer blocked-composer'>已拉黑：历史消息保留，解除后才能继续发送</View>
    : <View className='chat-composer'><Button id='e2e-message-image' onClick={sendImage}><Glyph name='image' /></Button><Button><Glyph name='bookmark' /></Button><Input id='e2e-message-input' value={text} onInput={(event) => setText(event.detail.value)} onConfirm={send} placeholder='输入消息…' /><Button id='e2e-message-send' className='send-button' onClick={send}>发送</Button></View>
  if (thread === undefined) return <AppShell title='消息' back noNav><View className='inline-state'><Text className='inline-title'>正在按时间顺序加载会话…</Text></View></AppShell>
  if (thread === null) return <AppShell title='消息' back noNav><View className='inline-state large'><Text className='inline-title'>会话加载失败</Text><Text className='inline-copy'>{error}</Text><Button className='primary-button' onClick={() => { setThread(undefined); setError(''); setAttempt((value) => value + 1) }}>重新加载</Button></View></AppShell>
  return <AppShell title={user?.name || '消息'} back noNav className='chat-page' scrollIntoView={scrollAnchor} overlay={composer}>
    {user && <View className='chat-user'><Avatar user={user} size={40} /><Text>{user.campus === '未设置' ? '校区未设置' : `${user.campus}校区`} · 站内用户</Text><Button className={`chat-block-action ${thread?.blocked ? 'is-active' : ''}`} onClick={toggleBlocked}><Glyph name='shield' />{thread?.blocked ? '解除拉黑' : '拉黑'}</Button></View>}
    <View className='chat-safety'><Glyph name='shield' />{thread?.blocked ? '已启用只读历史，双方不能继续发送消息' : '站内沟通更安全 · 当面交易请确认书况'}</View>
    {thread?.olderCursor && <Button className='secondary-button chat-load-older' disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? '正在加载…' : '查看更早消息'}</Button>}
    <View className='message-stream'><View className={`message-row ${contextMine ? 'mine' : ''}`}>{!contextMine && user && <Avatar user={user} size={37} />}<View className='message-content'><Button className='shared-book' onClick={() => navigationAdapter.go(`/pages/listing/detail?id=${listing.id}`)}><BookCover listing={listing} compact /><View><Text className='shared-title'>{listing.title}</Text><Text className='shared-author'>{listing.author}</Text><Text className='shared-price'>¥{listing.price}</Text></View></Button><Text className='message-bubble'>我想咨询这本书</Text><Text className='message-time'>会话关联商品</Text></View>{contextMine && <Avatar user={currentUser} size={37} />}</View>{thread.messages.map((message) => { const mine = message.senderId === currentUserId; return <View className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>{!mine && user && <Avatar user={user} size={37} />}<View className='message-content'>{message.kind === 'listing' && <Button className='shared-book' onClick={() => navigationAdapter.go(`/pages/listing/detail?id=${listing.id}`)}><BookCover listing={listing} compact /><View><Text className='shared-title'>{listing.title}</Text><Text className='shared-author'>{listing.author}</Text><Text className='shared-price'>¥{listing.price}</Text></View></Button>}<Text className='message-bubble'>{message.text}</Text><Text className='message-time'>{formatMessageTime(message.createdAt)}</Text></View>{mine && <Avatar user={currentUser} size={37} />}</View> })}</View>
    <View className='trade-tip'>❧ 交易小贴士：请在校内当面交易，确认书况后再付款哦～ ❧</View>
    <View id={scrollAnchor} className='chat-scroll-anchor'><View id='e2e-chat-end' /></View>
  </AppShell>
}
