import { useCallback, useState } from 'react'
import { View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import type { Listing } from '@/domain/types'
import { navigationAdapter } from '@/platform'

export default function FavoritesPage() { const [items, setItems] = useState<Listing[]>([]); const load = useCallback(() => demoRepository.listFavorites().then(setItems), []); useDidShow(() => { void load() }); return <AppShell title='我的收藏' back>{items.length ? <View className='listing-grid'>{items.map((item) => <ListingCard key={item.id} listing={item} onTap={() => navigationAdapter.go(`/pages/listing/detail?id=${item.id}`)} />)}</View> : <View id='e2e-favorites-empty' className='empty'>还没有收藏，去搜索一本需要的书吧。</View>}</AppShell> }
