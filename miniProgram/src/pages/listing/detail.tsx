import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import { AppShell, BookCover, StatusTag } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository, getUser } from '@/domain/repository'
import type { Listing } from '@/domain/types'
import { navigationAdapter, shareAdapter } from '@/platform'

export default function ListingDetailPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'math-7'
  const [item, setItem] = useState<Listing>()
  const [favorite, setFavorite] = useState(false)
  useEffect(() => { void demoRepository.getListing(id).then(setItem).catch(() => navigationAdapter.go('/pages/states/index?type=not-found')) }, [id])
  if (!item) return <AppShell title='商品详情' back><View className='empty'>正在翻找这本书…</View></AppShell>
  const seller = getUser(item.sellerId)
  const contact = async () => { const thread = await demoRepository.ensureThread(item.id); await navigationAdapter.go(`/pages/chat/index?id=${thread}`) }
  return <AppShell title='商品详情' back className='detail-page'>
    <View className='detail-layout'><View className='detail-gallery'><BookCover listing={item} /><View className='gallery-dots'><Text className='active' /><Text /><Text /></View></View><View className='detail-card'><View className='detail-eyebrow'><StatusTag status={item.status} /><Text>{item.category} · {item.course}</Text></View><Text className='detail-title'>{item.title}</Text><Text className='detail-author'>{item.author} · ISBN {item.isbn}</Text><View className='detail-price'><Text>¥{item.price.toFixed(2)}</Text><Text>¥{item.originalPrice.toFixed(2)}</Text><Text>{item.condition}</Text></View><View className='detail-facts'><Text>⌖ {item.campus}校区</Text><Text>▥ {item.course}</Text><Text>◈ 学生认证</Text></View><View className='description-block'><Text>书籍描述</Text><Text>{item.description}</Text><View className='chip-row'>{item.tags.map((tag) => <Text key={tag} className='chip'>#{tag}</Text>)}</View></View></View><View className='seller-card'><Image src={seller.avatar || '/assets/avatar-jian.webp'} mode='aspectFill' /><View><Text>{seller.name} · 已认证</Text><Text>{seller.campus}校区 · {seller.responseTime}</Text></View><Glyph name='chevron' /></View><View className='safety-note'><Glyph name='shield' /><Text>建议在校内公共区域当面验书，确认书况后再交易。</Text></View><View className='detail-cta'><Button id='e2e-detail-favorite' onClick={async () => setFavorite(await demoRepository.toggleFavorite(item.id))}><Glyph name='heart' />{favorite ? '已收藏' : '收藏'}</Button><Button onClick={() => shareAdapter.shareListing(item.id, item.title)}><Glyph name='send' />分享</Button><Button id='e2e-detail-contact' className='primary-button' onClick={contact}>联系卖家</Button></View></View>
  </AppShell>
}
