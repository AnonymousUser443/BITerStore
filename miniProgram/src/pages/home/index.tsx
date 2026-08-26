import { useCallback, useState } from 'react'
import { Button, Image, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, BookTile, RankItem } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import { defaultFilters } from '@/domain/filters'
import type { Listing } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const categories = ['全部', '教材教辅', '专业课', '考研考公', '文学小说']

export default function HomePage() {
  const [items, setItems] = useState<Listing[]>([])
  const [query, setQuery] = useState('')
  const load = useCallback(() => demoRepository.listListings().then(setItems), [])
  useDidShow(() => { void load() })
  const search = async () => { await demoRepository.saveFilters({ ...defaultFilters, query }); await navigationAdapter.switchTab('/pages/search/index') }
  const open = (item: Listing) => navigationAdapter.go(`/pages/listing/detail?id=${item.id}`)

  return <AppShell active='home' className='home-page'>
    <View className='search-box'><Glyph name='search' /><Input id='e2e-home-search-input' value={query} onInput={(e) => setQuery(e.detail.value)} onConfirm={search} placeholder='搜索书名、作者或 ISBN' /><Button id='e2e-home-search-entry' onClick={search}><Glyph name='filter' /></Button></View>
    <View className='category-chips'>{categories.map((category, index) => <Button key={category} className={index === 0 ? 'chip active' : 'chip'} onClick={() => navigationAdapter.switchTab('/pages/search/index')}>{category}</Button>)}</View>
    <View className='hero-card'><View className='hero-copy'><Text className='eyebrow'>书页轻翻 · 好物续航</Text><Text className='hero-title'>以书会友{process.env.TARO_ENV === 'h5' ? '\n' : ' '}共享知识之美</Text><Text className='hero-description'>让每一本闲置书，遇见下一位需要它的人。</Text><Button className='hero-button' onClick={() => navigationAdapter.switchTab('/pages/search/index')}>探索好书 <Text>→</Text></Button></View><Image className='hero-tobby' src='/assets/tobby-hello.webp' mode='aspectFit' /></View>
    <View className='section-block'><View className='section-heading'><Text className='section-title'>精选推荐</Text><Button className='section-more' onClick={() => navigationAdapter.switchTab('/pages/search/index')}>查看全部 <Glyph name='chevron' /></Button></View><View className='book-row'>{items.concat(items).slice(0, 5).map((item, index) => <BookTile key={`${item.id}-${index}`} listing={item} onTap={() => open(item)} />)}</View></View>
    <View className='ranking-card'><View className='section-heading'><Text className='section-title'>校园热榜</Text><Text className='section-note'>本周流动好书</Text></View>{items.slice(0, 3).map((item, index) => <RankItem key={item.id} listing={item} index={index} onTap={() => open(item)} />)}</View>
  </AppShell>
}
