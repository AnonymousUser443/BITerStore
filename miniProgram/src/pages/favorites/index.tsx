import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import type { Listing } from '@/domain/types'
import { navigationAdapter } from '@/platform'

export default function FavoritesPage() {
  const [items, setItems] = useState<Listing[]>()
  const load = useCallback(() => demoRepository.listFavorites().then(setItems), [])
  useDidShow(() => { void requireAccount('登录后才能查看收藏').then((allowed) => allowed && load()) })
  return <AppShell title='我的收藏' back className='simple-list-page'>{items === undefined ? <View className='inline-state'><Image src='/assets/tobby-search.webp' mode='aspectFit' /><Text className='inline-title'>托比正在翻找书架…</Text></View> : items.length ? <View className='listing-stack'>{items.map((item) => <ListingCard key={item.id} listing={item} href={`/pages/listing/detail?id=${item.id}`} favorite onFavorite={async () => { await demoRepository.toggleFavorite(item.id); setItems(items.filter((value) => value.id !== item.id)) }} />)}</View> : <View id='e2e-favorites-empty' className='inline-state large'><Image src='/assets/tobby-question.webp' mode='aspectFit' /><Text className='inline-title'>收藏夹还空空的</Text><Text className='inline-copy'>看到心仪的书，点一下爱心就能在这里找到它。</Text><Button className='primary-button' onClick={() => navigationAdapter.switchTab('/pages/search/index')}>去发现好书</Button></View>}</AppShell>
}
