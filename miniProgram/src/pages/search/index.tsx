import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, Picker, Switch, Text, View } from '@tarojs/components'
import { AppShell, FilterDrawer, ListingCard } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { defaultFilters } from '@/domain/filters'
import { demoRepository } from '@/domain/repository'
import type { Campus, Condition, Listing, ListingFilters } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const categories = ['全部', '教材教辅', '专业课', '考研考公', '文学小说']
const campusRange = ['全部', '中关村', '良乡', '西山', '珠海']
const conditionRange = ['全部', '全新', '九成新', '八成新', '七成新及以下']

export default function SearchPage() {
  const initialQuery = Taro.getCurrentInstance().router?.params.q || ''
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters, query: initialQuery })
  const [items, setItems] = useState<Listing[]>([])
  const [drawer, setDrawer] = useState(false)
  useEffect(() => { void demoRepository.getFilters().then((saved) => setFilters(initialQuery ? { ...saved, query: initialQuery } : saved)) }, [initialQuery])
  useEffect(() => { void demoRepository.saveFilters(filters) }, [filters])
  const load = useCallback(() => demoRepository.listListings(filters).then(setItems), [filters])
  useEffect(() => { void load() }, [load])

  return <AppShell active='search' className='search-page'>
    <View className='search-input'><Glyph name='search' /><Input id='e2e-search-input' value={filters.query} onInput={(e) => setFilters({ ...filters, query: e.detail.value })} placeholder='搜索书名 / 作者 / ISBN / 课程' /><Button onClick={() => setFilters({ ...filters, query: '' })}><Glyph name={filters.query ? 'back' : 'camera'} /></Button></View>
    <View className='category-chips'>{categories.map((category, index) => <Button key={category} className={`${index === 0 ? 'chip active' : 'chip'} ${filters.category === category ? 'selected' : ''}`} onClick={() => setFilters({ ...filters, category: category === '教材教辅' ? '数学' : category === '专业课' ? '计算机' : category === '考研考公' ? '经管' : category === '全部' ? '全部' : category })}>{category}</Button>)}</View>
    <View className='quick-filters'><Button onClick={() => setDrawer(true)}>校区 <Glyph name='chevron' /></Button><Button onClick={() => setDrawer(true)}>成色 <Glyph name='chevron' /></Button><Button onClick={() => setDrawer(true)}>价格 <Glyph name='chevron' /></Button><Button onClick={() => setDrawer(true)}>{filters.sort} <Glyph name='chevron' /></Button><Button className='availability-filter' onClick={() => setFilters({ ...filters, availableOnly: !filters.availableOnly })}>{filters.availableOnly ? '✓ ' : ''}只看可交易</Button><Button id='e2e-search-filter' className='filter-trigger' onClick={() => setDrawer(true)}><Glyph name='filter' />筛选</Button></View>
    <View className='search-tobby-hint'><Image className='search-hint-image' src='/assets/tobby-search.webp' mode='aspectFit' /><View className='search-hint-copy'><Text>托比提示</Text><Text>组合筛选，找书更快更准。</Text></View></View>
    <View className='results-heading'><Text>为你找到 <Text>{items.length}</Text> 本书</Text><Text>{filters.availableOnly ? '只显示可交易' : filters.sort}</Text></View>
    {items.length ? <View className='listing-stack'>{items.map((item) => <ListingCard key={item.id} listing={item} onTap={() => navigationAdapter.go(`/pages/listing/detail?id=${item.id}`)} />)}</View> : <View className='empty'>没有找到匹配的书，换个关键词试试。</View>}
    <FilterDrawer open={drawer} onClose={() => setDrawer(false)}><View className='sheet-heading'><Text className='section-title'>高级筛选</Text><Button onClick={() => setFilters(defaultFilters)}>清空</Button></View><Picker mode='selector' range={campusRange} onChange={(e) => setFilters({ ...filters, campus: campusRange[Number(e.detail.value)] as Campus | '全部' })}><View className='menu-row'>校区<Text className='grow' /><Text>{filters.campus}</Text></View></Picker><Picker mode='selector' range={conditionRange} onChange={(e) => setFilters({ ...filters, condition: conditionRange[Number(e.detail.value)] as Condition | '全部' })}><View className='menu-row'>成色<Text className='grow' /><Text>{filters.condition}</Text></View></Picker><View className='menu-row'><Text className='grow'>仅看可交易</Text><Switch checked={filters.availableOnly} onChange={(e) => setFilters({ ...filters, availableOnly: e.detail.value })} /></View><Button className='primary-button' onClick={() => setDrawer(false)}>查看 {items.length} 个结果</Button></FilterDrawer>
  </AppShell>
}
