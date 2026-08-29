import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import { AppShell, Avatar, BookCover } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository, getUser } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import type { Listing } from '@/domain/types'
import { feedbackAdapter, mediaAdapter, navigationAdapter } from '@/platform'

export default function ListingDetailPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'math-7'
  const [item, setItem] = useState<Listing | undefined>(() => demoRepository.peekListing(id))
  const [favorite, setFavorite] = useState(false)
  const [localImages, setLocalImages] = useState<string[]>([])
  useEffect(() => { void demoRepository.getListing(id).then(setItem).catch(() => navigationAdapter.go('/pages/states/index?type=not-found')) }, [id])
  useEffect(() => { if (item?.imageUrls?.length) return setLocalImages(item.imageUrls); if (item?.mediaIds.length) void mediaAdapter.list().then((media) => setLocalImages(media.filter((value) => item.mediaIds.includes(value.id)).map((value) => value.uri))) }, [item])
  if (!item) return <AppShell title='商品详情' back><View className='empty'>正在翻找这本书…</View></AppShell>
  const seller = item.seller || getUser(item.sellerId)
  const contact = async () => { if (!await requireAccount('请先使用学号登录后联系卖家')) return; const thread = await demoRepository.ensureThread(item.id); await navigationAdapter.go(`/pages/chat/index?id=${thread}`) }
  const report = async () => {
    if (!await requireAccount('请先使用学号登录后举报商品')) return
    if (!await feedbackAdapter.confirm('举报商品', '确认举报该商品存在不当或虚假信息？管理员将进行审核。')) return
    try { await demoRepository.reportListing(item.id, '商品信息不当或疑似虚假'); await feedbackAdapter.toast('举报已提交') }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '举报提交失败') }
  }
  const unavailable = item.status !== 'available'
  const label = { available: '可交易', sold: '已售', offline: '已下架', draft: '草稿', reviewing: '待审核' }[item.status]
  return <AppShell title='商品详情' back className='detail-page'>
    <View className='detail-gallery'>{localImages.length ? localImages.map((url, index) => <Image key={`${url}-${index}`} src={url} mode='aspectFill' />) : <BookCover listing={item} />}{unavailable && <Text>{label}</Text>}</View>
    <View className='detail-card'><View className='detail-title'><View><Text className={`status-pill ${item.status}`}>{label}</Text><Text className='detail-heading'>{item.title}</Text><Text className='detail-author'>{item.author}</Text></View><Button id='e2e-detail-favorite' onClick={async () => { if (!await requireAccount('登录后才能收藏商品')) return; setFavorite(await demoRepository.toggleFavorite(item.id)) }}><Glyph name='heart' />{favorite ? '✓' : ''}</Button></View><View className='detail-price'><Text className='detail-current-price'>¥{item.price.toFixed(2)}</Text><Text className='detail-original-price'>¥{item.originalPrice.toFixed(2)}</Text><Text className='detail-condition'>{item.condition}</Text></View><View className='detail-facts'><Text>⌖ {item.campus}校区</Text><Text>▥ {item.course}</Text><Text>ⓘ ISBN {item.isbn}</Text></View><View className='description-block'><Text className='description-title'>书籍简介</Text><Text className='description-copy'>{item.description}</Text><View>{item.tags.map((tag) => <Text key={tag}>#{tag}</Text>)}</View></View></View>
    <View className='seller-card'><Avatar user={seller} size={52} /><View><Text className='seller-name'>{seller.name} ◈</Text><Text className='seller-campus'>{seller.campus}校区 · 已完成校园认证</Text><Text className='seller-response'>{seller.responseTime}</Text></View><Button onClick={contact}>联系</Button></View>
    <View className='safety-note'><Glyph name='shield' />建议在校内公共场所当面验书，确认书况后再付款。</View>
    <View className='detail-cta'><Button className='report-action' onClick={report}><Glyph name='warning' />举报</Button><Button id='e2e-detail-contact' className='primary-button' disabled={unavailable} onClick={contact}><Glyph name='message' />{unavailable ? '当前不可联系' : '联系卖家'}</Button></View>
  </AppShell>
}
