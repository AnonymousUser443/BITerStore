import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { AppShell, StatusTag, Tobby } from '@/components/ui'
import { demoRepository, getUser } from '@/domain/repository'
import type { Listing } from '@/domain/types'
import { navigationAdapter, shareAdapter } from '@/platform'

export default function ListingDetailPage() {
  const id = Taro.getCurrentInstance().router?.params.id || 'math-7'; const [item, setItem] = useState<Listing>(); const [favorite, setFavorite] = useState(false)
  useEffect(() => { void demoRepository.getListing(id).then(setItem).catch(() => navigationAdapter.go('/pages/states/index?type=not-found')) }, [id])
  if (!item) return <AppShell title='商品详情' back><View className='empty'>正在翻找这本书…</View></AppShell>
  const seller = getUser(item.sellerId); const contact = async () => { const thread = await demoRepository.ensureThread(item.id); await navigationAdapter.go(`/pages/chat/index?id=${thread}`) }
  return <AppShell title='商品详情' back><View className='detail-layout'><View className={`book-cover detail-cover ${item.tone}`}><Tobby mood='heart' caption={item.title} /></View><View className='detail-card paper-card'><StatusTag status={item.status} /><Text className='muted'>{item.category} · {item.course}</Text><Text className='section-title'>{item.title}</Text><Text className='muted'>{item.author} · ISBN {item.isbn}</Text><View className='price-row'><Text className='price'>¥{item.price}</Text><Text className='original'>¥{item.originalPrice}</Text></View><Text>{item.description}</Text><View className='chip-row'>{item.tags.map((tag) => <Text key={tag} className='chip'>{tag}</Text>)}</View><View className='seller-row'><View className='avatar' /><View className='grow'><Text>{seller.name} · 已认证</Text><Text className='muted'>{seller.campus} · {seller.responseTime}</Text></View></View><View className='inline-toast'>建议在校内公共区域当面验书，确认书况后再交易。</View><View className='button-row'><Button id='e2e-detail-favorite' className='secondary-button' onClick={async () => setFavorite(await demoRepository.toggleFavorite(item.id))}>{favorite ? '已收藏' : '收藏'}</Button><Button className='secondary-button' onClick={() => shareAdapter.shareListing(item.id, item.title)}>分享</Button><Button id='e2e-detail-contact' className='primary-button' onClick={contact}>联系卖家</Button></View></View></View></AppShell>
}
