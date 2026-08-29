import { useCallback, useMemo, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import type { Listing, ListingStatus } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

export default function MyListingsPage() {
  const [tab, setTab] = useState<ListingStatus | 'all'>('all')
  const [items, setItems] = useState<Listing[]>(() => demoRepository.peekMyListings() || [])
  const load = useCallback(() => demoRepository.listMyListings().then(setItems), [])
  useDidShow(() => { void requireAccount('请先使用学号登录后管理商品').then((allowed) => { if (allowed) return load() }) })
  const visible = useMemo(() => tab === 'all' ? items : items.filter((item) => item.status === tab), [items, tab])
  const change = async (item: Listing) => { await demoRepository.updateListingStatus(item.id, item.status === 'available' ? 'sold' : 'available'); await load() }
  const remove = async (item: Listing) => { if (!await feedbackAdapter.confirm('删除发布', `确定删除《${item.title}》吗？删除后不会再公开展示。`)) return; await demoRepository.deleteListing(item.id); await feedbackAdapter.toast('已删除这本书'); await load() }
  return <AppShell title='我的发布' back className='simple-list-page'><View className='status-tabs'>{([['all', '全部'], ['available', '在售'], ['sold', '已售'], ['offline', '下架']] as const).map(([value, label]) => <Button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</Button>)}</View>{visible.length ? visible.map((item) => <View className='manage-listing' key={item.id}><ListingCard listing={item} href={`/pages/listing/detail?id=${item.id}`} ownerView /><View className='manage-listing-actions'>{['available', 'offline'].includes(item.status) && <Button className='secondary-button' onClick={() => change(item)}>{item.status === 'available' ? '标记已售' : '重新上架'}</Button>}<Button className='danger-button' onClick={() => remove(item)}>删除</Button></View></View>) : <View id='e2e-my-listings-empty' className='inline-state'><Image src='/assets/tobby-question.webp' mode='aspectFit' /><Text className='inline-title'>这次没有找到合适的书</Text><Text className='inline-copy'>换个状态，或者发布一本闲置书吧。</Text></View>}<Button className='floating-add' onClick={() => navigationAdapter.switchTab('/pages/publish/index')}>＋ 发布一本书</Button></AppShell>
}
