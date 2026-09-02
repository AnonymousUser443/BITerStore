import { useCallback, useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Input, ScrollView, Slider, Text, View } from '@tarojs/components'
import { bundledAsset } from '@/assets'
import { AppShell, FilterDrawer, ListingCard } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { defaultFilters } from '@/domain/filters'
import { demoRepository } from '@/domain/repository'
import { isAuthenticated, requireAccount } from '@/domain/access'
import type { Campus, Condition, Listing, ListingFilters } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const categories = ['全部', '教材教辅', '专业课', '考研考公', '文学小说']
const campusRange = ['全部', '中关村', '良乡', '西山', '珠海']
const conditionRange = ['全部', '全新', '九成新', '八成新', '七成新及以下']

export default function SearchPage() {
  const initialQuery = Taro.getCurrentInstance().router?.params.q || ''
  const [filters, setFilters] = useState<ListingFilters>({ ...defaultFilters, query: initialQuery })
  const [items, setItems] = useState<Listing[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [drawer, setDrawer] = useState(false)
  const [filtersReady, setFiltersReady] = useState(false)
  useEffect(() => {
    let active = true
    void demoRepository.getFilters().then((saved) => {
      if (!active) return
      setFilters(initialQuery ? { ...saved, query: initialQuery } : saved)
      setFiltersReady(true)
    })
    return () => { active = false }
  }, [initialQuery])
  useEffect(() => { if (filtersReady) void demoRepository.saveFilters(filters) }, [filters, filtersReady])
  const load = useCallback(() => demoRepository.listListings(filters).then(setItems), [filters])
  useEffect(() => { if (filtersReady) void load() }, [filtersReady, load])
  useEffect(() => { void isAuthenticated().then((loggedIn) => { if (loggedIn) return demoRepository.listFavorites().then((saved) => setFavorites(saved.map((item) => item.id))) }) }, [])
  const toggleFavorite = async (id: string) => { if (!await requireAccount('登录后才能收藏商品')) return; const active = await demoRepository.toggleFavorite(id); setFavorites((current) => active ? [...new Set([...current, id])] : current.filter((value) => value !== id)) }
  const contact = async (item: Listing) => { if (!await requireAccount('请先使用学号登录后联系卖家')) return; const thread = await demoRepository.ensureThread(item.id); await navigationAdapter.go(`/pages/chat/index?id=${thread}`) }

  return <AppShell active='search' className='search-page'>
    <View className='search-input'><Glyph name='search' /><Input id='e2e-search-input' value={filters.query} onInput={(e) => setFilters({ ...filters, query: e.detail.value })} placeholder='搜索书名 / 作者 / ISBN / 课程' /><Button onClick={() => setFilters({ ...filters, query: '' })}><Glyph name={filters.query ? 'back' : 'camera'} /></Button></View>
    <View className='category-chips'>{categories.map((category) => <Button key={category} className={`chip ${filters.category === category ? 'active' : ''}`} onClick={() => setFilters({ ...filters, category })}>{category}</Button>)}</View>
    <ScrollView scrollX enhanced showScrollbar={false} className='quick-filters-scroll'><View className='quick-filters'><Button onClick={() => setDrawer(true)}>校区 <Glyph name='chevron' /></Button><Button onClick={() => setDrawer(true)}>成色 <Glyph name='chevron' /></Button><Button onClick={() => setDrawer(true)}>价格 <Glyph name='chevron' /></Button><Button onClick={() => setFilters({ ...filters, sort: filters.sort === '最新发布' ? '价格从低到高' : filters.sort === '价格从低到高' ? '价格从高到低' : '最新发布' })}>{filters.sort} <Glyph name='chevron' /></Button><Button className={`availability-filter ${filters.availableOnly ? 'active' : ''}`} aria-label='只看可交易' onClick={() => setFilters({ ...filters, availableOnly: !filters.availableOnly })}><Text>只看可交易</Text><View className='availability-toggle'><View /></View></Button><Button id='e2e-search-filter' className='filter-trigger' onClick={() => setDrawer(true)}><Glyph name='filter' />筛选</Button></View></ScrollView>
    <View className='search-tobby-hint'><Image className='search-hint-image' src={bundledAsset('tobby-search')} mode='aspectFit' /><View className='search-hint-copy'><Text>托比提示</Text><Text>组合筛选，找书更快更准。</Text></View></View>
    <View className='results-heading'><Text>为你找到 <Text>{items.length}</Text> 本书</Text><Text>{filters.availableOnly ? '只显示可交易' : filters.sort}</Text></View>
    {items.length ? <View className='listing-stack'>{items.map((item) => <ListingCard key={item.id} listing={item} href={`/pages/listing/detail?id=${item.id}`} favorite={favorites.includes(item.id)} onFavorite={() => toggleFavorite(item.id)} onContact={() => contact(item)} />)}</View> : <View className='inline-state'><Image src={bundledAsset('tobby-question')} mode='aspectFit' /><Text className='inline-title'>这次没有找到合适的书</Text><Text className='inline-copy'>换个关键词，或者发布一条求书心愿吧。</Text><Button className='secondary-button' onClick={() => navigationAdapter.go('/pages/states/index?type=no-results')}>查看空状态</Button></View>}
    <FilterDrawer open={drawer} onClose={() => setDrawer(false)}><View className='sheet-handle' /><View className='sheet-title'><Text className='sheet-title-copy'>高级筛选 <Glyph name='leaf' /></Text><Button onClick={() => setFilters(defaultFilters)}>↻ 清空</Button><Button aria-label='关闭筛选' onClick={() => setDrawer(false)}>×</Button></View><View className='range-label'><Text>价格区间（元）</Text><Text className='range-value'>¥0 — ¥{filters.maxPrice}{filters.maxPrice === 200 ? '+' : ''}</Text><Slider className='range-slider' min={0} max={200} step={10} value={filters.maxPrice} activeColor='#6f7956' backgroundColor='#ded9ca' blockColor='#fffdf8' blockSize={22} onChange={(event) => setFilters({ ...filters, maxPrice: event.detail.value })} /></View><FilterGroup label='校区' options={campusRange} value={filters.campus} onSelect={(campus) => setFilters({ ...filters, campus: campus as Campus | '全部' })} /><FilterGroup label='分类' options={categories} value={filters.category} onSelect={(category) => setFilters({ ...filters, category })} /><FilterGroup label='成色' options={conditionRange} value={filters.condition} onSelect={(condition) => setFilters({ ...filters, condition: condition as Condition | '全部' })} /><FilterGroup label='排序' options={['最新发布', '价格从低到高', '价格从高到低']} value={filters.sort} onSelect={(sort) => setFilters({ ...filters, sort: sort as ListingFilters['sort'] })} /><Button className='switch-row' onClick={() => setFilters({ ...filters, availableOnly: !filters.availableOnly })}><Text>只看可交易</Text><View className={`filter-toggle ${filters.availableOnly ? 'active' : ''}`}><View /></View></Button><Button id='e2e-search-apply-filter' className='primary-button apply-filter' onClick={() => setDrawer(false)}>查看 {items.length} 个结果</Button></FilterDrawer>
  </AppShell>
}

function FilterGroup({ label, options, value, onSelect }: { label: string; options: readonly string[]; value: string; onSelect: (value: string) => void }) {
  return <View className='filter-group'><Text className='filter-group-label'>{label}</Text><View>{options.map((option) => <Button className={option === value ? 'active' : ''} onClick={() => onSelect(option)} key={option}>{option}</Button>)}</View></View>
}
