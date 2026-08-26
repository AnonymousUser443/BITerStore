import { useCallback, useState } from 'react'
import { Button, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard, Tobby } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import { defaultFilters } from '@/domain/filters'
import type { Listing } from '@/domain/types'
import { navigationAdapter } from '@/platform'

export default function HomePage() {
  const [items, setItems] = useState<Listing[]>([]); const [query, setQuery] = useState('')
  const load = useCallback(() => demoRepository.listListings().then(setItems), []); useDidShow(() => { void load() })
  const search = async () => { await demoRepository.saveFilters({ ...defaultFilters, query }); await navigationAdapter.switchTab('/pages/search/index') }
  return <AppShell><View className='search-bar'><Input id='e2e-home-search-input' value={query} onInput={(e) => setQuery(e.detail.value)} placeholder='搜索书名、课程或 ISBN' /><Button id='e2e-home-search-entry' onClick={search}>搜索</Button></View><View className='home-layout'><View className='hero-card'><View className='hero-copy'><Text className='muted'>开学循环计划</Text><Text className='section-title'>旧书的新一程</Text><Text className='muted'>让知识从上一位同学手中，温柔地抵达下一站。</Text><Button className='secondary-button' onClick={() => navigationAdapter.switchTab('/pages/publish/index')}>发布闲置</Button></View><Tobby mood='hello' /></View><View className='paper-card'><View className='section-row'><Text className='section-title'>校园热榜</Text></View>{items.slice(0, 3).map((x, i) => <View key={x.id} className='menu-row'><Text>{i + 1}</Text><Text className='grow'>{x.title}</Text><Text>¥{x.price}</Text></View>)}</View></View><View className='section-row'><Text className='section-title'>最近上新</Text><Button className='text-button' onClick={() => navigationAdapter.switchTab('/pages/search/index')}>查看全部</Button></View><View className='listing-grid wide-five'>{items.map((item) => <ListingCard key={item.id} listing={item} onTap={() => navigationAdapter.go(`/pages/listing/detail?id=${item.id}`)} />)}</View></AppShell>
}
