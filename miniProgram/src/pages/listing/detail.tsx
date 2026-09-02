import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Swiper, SwiperItem, Text, View } from '@tarojs/components'
import { isNetworkWebp } from '@/assets'
import { AppShell, Avatar, BookCover } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository, getUser } from '@/domain/repository'
import { getAuthenticatedUserId, requireAccount } from '@/domain/access'
import type { Listing } from '@/domain/types'
import { feedbackAdapter, mediaAdapter, navigationAdapter } from '@/platform'

export default function ListingDetailPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'math-7'
  const [item, setItem] = useState<Listing | undefined>(() => demoRepository.peekListing(id))
  const [favorite, setFavorite] = useState(false)
  const [localImages, setLocalImages] = useState<string[]>([])
  const [viewerId, setViewerId] = useState<string>()
  const [pendingAction, setPendingAction] = useState<'favorite' | 'contact'>()
  useEffect(() => { void demoRepository.getListing(id).then(setItem).catch(() => navigationAdapter.go('/pages/states/index?type=not-found')) }, [id])
  useEffect(() => { if (item?.imageUrls?.length) return setLocalImages(item.imageUrls); if (item?.mediaIds.length) void mediaAdapter.list().then((media) => setLocalImages(media.filter((value) => item.mediaIds.includes(value.id)).map((value) => value.uri))) }, [item])
  useEffect(() => {
    let active = true
    void getAuthenticatedUserId().then(async (userId) => {
      if (!active) return
      setViewerId(userId)
      if (userId) setFavorite((await demoRepository.listFavorites()).some((value) => value.id === id))
    }).catch(() => undefined)
    return () => { active = false }
  }, [id])
  if (!item) return <AppShell title='商品详情' back><View className='empty'>正在翻找这本书…</View></AppShell>
  const seller = item.seller || getUser(item.sellerId)
  const ownListing = viewerId === item.sellerId
  const toggleFavorite = async () => {
    if (!await requireAccount('登录后才能收藏商品')) return
    const userId = viewerId || await getAuthenticatedUserId()
    if (userId === item.sellerId) return feedbackAdapter.toast('不能收藏自己的商品')
    if (pendingAction) return
    setPendingAction('favorite')
    try { setFavorite(await demoRepository.toggleFavorite(item.id)) }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '收藏操作失败，请稍后重试') }
    finally { setPendingAction(undefined) }
  }
  const contact = async () => {
    if (!await requireAccount('请先使用学号登录后联系卖家')) return
    const userId = viewerId || await getAuthenticatedUserId()
    if (userId === item.sellerId) return feedbackAdapter.toast('不能联系自己发布的商品')
    if (pendingAction) return
    setPendingAction('contact')
    try { const thread = await demoRepository.ensureThread(item.id); await navigationAdapter.go(`/pages/chat/index?id=${thread}`) }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '联系卖家失败，请稍后重试') }
    finally { setPendingAction(undefined) }
  }
  const report = async () => {
    if (!await requireAccount('请先使用学号登录后举报商品')) return
    if (!await feedbackAdapter.confirm('举报商品', '确认举报该商品存在不当或虚假信息？管理员将进行审核。')) return
    try { await demoRepository.reportListing(item.id, '商品信息不当或疑似虚假'); await feedbackAdapter.toast('举报已提交') }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '举报提交失败') }
  }
  const unavailable = item.status !== 'available'
  const label = { available: '可交易', sold: '已售', offline: '已下架', draft: '草稿', reviewing: '待审核' }[item.status]
  return <AppShell title='商品详情' back className='detail-page'>
    <View className='detail-gallery-shell'><Swiper className='detail-gallery' indicatorDots={localImages.length > 1} indicatorColor='rgba(255,255,255,.58)' indicatorActiveColor='#ffffff' autoplay={localImages.length > 1} circular={localImages.length > 1} interval={4000} duration={500}>{localImages.length ? localImages.map((url, index) => <SwiperItem key={`${url}-${index}`}><Image className='detail-slide' src={url} webp={isNetworkWebp(url)} mode='aspectFit' /></SwiperItem>) : <SwiperItem><BookCover listing={item} /></SwiperItem>}</Swiper>{unavailable && <Text className='gallery-status'>{label}</Text>}</View>
    <View className='detail-card'><View className='detail-title'><View><Text className={`status-pill ${item.status}`}>{label}</Text><Text className='detail-heading'>{item.title}</Text><Text className='detail-author'>{item.author}</Text></View><Button id='e2e-detail-favorite' disabled={pendingAction === 'favorite'} onClick={toggleFavorite}><Glyph name='heart' />{favorite ? '✓' : ''}</Button></View><View className='detail-price'><Text className='detail-current-price'>¥{item.price.toFixed(2)}</Text><Text className='detail-condition'>{item.condition}</Text></View><View className='detail-facts'><Text>⌖ {item.campus}校区</Text>{item.course.trim() ? <Text>▥ {item.course}</Text> : null}<Text>ⓘ ISBN {item.isbn}</Text></View><View className='description-block'><Text className='description-title'>书籍简介</Text><Text className='description-copy'>{item.description}</Text><View>{item.tags.map((tag) => <Text key={tag}>#{tag}</Text>)}</View></View></View>
    <View className='seller-card'><Avatar user={seller} size={52} /><View><Text className='seller-name'>{seller.name} ◈</Text><Text className='seller-campus'>{seller.campus}校区 · 已完成校园认证</Text><Text className='seller-response'>{seller.responseTime}</Text></View><Button disabled={unavailable || pendingAction === 'contact'} onClick={contact}>{ownListing ? '本人商品' : pendingAction === 'contact' ? '正在联系…' : '联系'}</Button></View>
    <View className='safety-note'><Glyph name='shield' />建议在校内公共场所当面验书，确认书况后再付款。</View>
    <View className='detail-cta'><Button className='report-action' onClick={report}><Glyph name='warning' />举报</Button><Button id='e2e-detail-contact' className='primary-button' disabled={unavailable || pendingAction === 'contact'} onClick={contact}><Glyph name='message' />{unavailable ? '当前不可联系' : ownListing ? '这是我的商品' : pendingAction === 'contact' ? '正在联系卖家…' : '联系卖家'}</Button></View>
  </AppShell>
}
