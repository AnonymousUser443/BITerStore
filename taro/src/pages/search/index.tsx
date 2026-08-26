import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Input, Picker, Switch, Text, View } from '@tarojs/components'
import { AppShell, FilterDrawer, ListingCard } from '@/components/ui'
import { defaultFilters } from '@/domain/filters'
import { demoRepository } from '@/domain/repository'
import type { Campus, Condition, Listing, ListingFilters } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const categories = ['全部', '数学', '计算机', '经管']
export default function SearchPage() {
  const initialQuery = Taro.getCurrentInstance().router?.params.q || ''; const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters, query: initialQuery }); const [items, setItems] = useState<Listing[]>([]); const [drawer, setDrawer] = useState(false)
  useEffect(() => { void demoRepository.getFilters().then((saved) => setFilters(initialQuery ? { ...saved, query: initialQuery } : saved)) }, [initialQuery])
  useEffect(() => { void demoRepository.saveFilters(filters) }, [filters])
  const load = useCallback(() => demoRepository.listListings(filters).then(setItems), [filters]); useEffect(() => { void load() }, [load])
  return <AppShell title='搜索'><View className='search-bar'><Input id='e2e-search-input' value={filters.query} onInput={(e) => setFilters({ ...filters, query: e.detail.value })} placeholder='书名、作者、课程、ISBN' /><Button id='e2e-search-filter' onClick={() => setDrawer(true)}>筛选</Button></View><View className='chip-row'>{categories.map((category) => <Button key={category} className={`chip ${filters.category === category ? 'active' : ''}`} onClick={() => setFilters({ ...filters, category })}>{category}</Button>)}</View><View className='section-row'><Text className='section-title'>{items.length} 本可选</Text><Text className='muted'>{filters.sort}</Text></View>{items.length ? <View className='listing-grid'>{items.map((item) => <ListingCard key={item.id} listing={item} onTap={() => navigationAdapter.go(`/pages/listing/detail?id=${item.id}`)} />)}</View> : <View className='empty'>没有找到匹配的书，换个关键词试试。</View>}<FilterDrawer open={drawer} onClose={() => setDrawer(false)}><Text className='section-title'>组合筛选</Text><Picker mode='selector' range={['全部', '中关村', '良乡', '西山', '珠海']} onChange={(e) => setFilters({ ...filters, campus: ['全部', '中关村', '良乡', '西山', '珠海'][Number(e.detail.value)] as Campus | '全部' })}><View className='menu-row'>校区<Text className='grow' /><Text>{filters.campus}</Text></View></Picker><Picker mode='selector' range={['全部', '全新', '九成新', '八成新', '七成新及以下']} onChange={(e) => setFilters({ ...filters, condition: ['全部', '全新', '九成新', '八成新', '七成新及以下'][Number(e.detail.value)] as Condition | '全部' })}><View className='menu-row'>成色<Text className='grow' /><Text>{filters.condition}</Text></View></Picker><View className='menu-row'><Text className='grow'>仅看可交易</Text><Switch checked={filters.availableOnly} onChange={(e) => setFilters({ ...filters, availableOnly: e.detail.value })} /></View><Button className='primary-button' onClick={() => setDrawer(false)}>应用筛选</Button></FilterDrawer></AppShell>
}
