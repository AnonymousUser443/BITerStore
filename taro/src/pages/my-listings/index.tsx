import { useCallback, useState } from 'react'
import { Button, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import type { Listing } from '@/domain/types'

export default function MyListingsPage() { const [items, setItems] = useState<Listing[]>([]); const load = useCallback(() => demoRepository.listMyListings().then(setItems), []); useDidShow(() => { void load() }); return <AppShell title='我的发布' back>{items.length ? <View className='listing-grid'>{items.map((item) => <View key={item.id}><ListingCard listing={item} /><View className='button-row'><Button className='secondary-button' onClick={async () => { await demoRepository.updateListingStatus(item.id, item.status === 'available' ? 'sold' : 'available'); await load() }}>{item.status === 'available' ? '标记已售' : '重新上架'}</Button><Button className='secondary-button' onClick={async () => { await demoRepository.updateListingStatus(item.id, 'offline'); await load() }}>下架</Button></View></View>)}</View> : <View id='e2e-my-listings-empty' className='empty'>还没有发布记录，先发布一本闲置书吧。</View>}</AppShell> }
