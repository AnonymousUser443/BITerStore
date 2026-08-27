import { useCallback, useMemo, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import type { Listing, ListingStatus } from '@/domain/types'
import { navigationAdapter } from '@/platform'

export default function MyListingsPage() {
  const [tab, setTab] = useState<ListingStatus | 'all'>('all')
  const [items, setItems] = useState<Listing[]>([])
  const load = useCallback(() => demoRepository.listMyListings().then(setItems), [])
  useDidShow(() => { void load() })
  const visible = useMemo(() => tab === 'all' ? items : items.filter((item) => item.status === tab), [items, tab])
  const change = async (item: Listing) => { await demoRepository.updateListingStatus(item.id, item.status === 'available' ? 'sold' : 'available'); await load() }
  return <AppShell title='我的发布' back className='simple-list-page'><View className='status-tabs'>{([['all', '全部'], ['available', '在售'], ['sold', '已售'], ['offline', '下架']] as const).map(([value, label]) => <Button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</Button>)}</View>{visible.length ? visible.map((item) => <View className='manage-listing' key={item.id}><ListingCard listing={item} onTap={() => navigationAdapter.go(`/pages/listing/detail?id=${item.id}`)} /><Button className='secondary-button' onClick={() => change(item)}>{item.status === 'available' ? '标记已售' : '重新上架'}</Button></View>) : <View id='e2e-my-listings-empty' className='inline-state'><Image src='/assets/tobby-question.webp' mode='aspectFit' /><Text className='inline-title'>这次没有找到合适的书</Text><Text className='inline-copy'>换个状态，或者发布一本闲置书吧。</Text></View>}<Button className='floating-add' onClick={() => navigationAdapter.switchTab('/pages/publish/index')}>＋ 发布一本书</Button></AppShell>
}
