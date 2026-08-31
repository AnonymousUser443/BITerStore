import { useCallback, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, BookTile, RankItem } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import { defaultFilters } from '@/domain/filters'
import { preserveSnapshot } from '@/domain/snapshot'
import type { Listing } from '@/domain/types'
import { navigationAdapter } from '@/platform'

const categories = ['全部', '教材教辅', '专业课', '考研考公', '文学小说']

export default function HomePage() {
  const [items, setItems] = useState<Listing[]>()
  const load = useCallback(() => demoRepository.listListings().then((next) => setItems((current) => preserveSnapshot(current, next))), [])
  useDidShow(() => { void load() })
  const openSearch = (filters = defaultFilters) => {
    // saveFilters updates its in-memory hand-off synchronously. Navigation can
    // therefore start in the same tap frame while persistence finishes.
    void demoRepository.saveFilters(filters)
    void navigationAdapter.switchTab('/pages/search/index')
  }
  const search = () => openSearch()
  const chooseCategory = (category: string) => openSearch({ ...defaultFilters, category })

  return <AppShell active='home' className='home-page'>
    <Button id='e2e-home-search-entry' className='search-box' onClick={search}><Glyph name='search' /><Text className='search-placeholder'>搜索书名、作者或 ISBN</Text><Glyph name='filter' /></Button>
    <View className='category-chips'>{categories.map((category, index) => <Button key={category} className={index === 0 ? 'chip active' : 'chip'} onClick={() => chooseCategory(category)}>{category}</Button>)}</View>
    <View className='hero-card'><View className='hero-copy'><Text className='eyebrow'>书页轻翻 · 好物续航</Text><Text className='hero-title'>以书会友{process.env.TARO_ENV === 'h5' ? '\n' : ' '}共享知识之美</Text><Text className='hero-description'>让每一本闲置书，遇见下一位需要它的人。</Text><Button className='hero-button' onClick={() => openSearch()}>探索好书 <Text>→</Text></Button></View><Image className='hero-tobby' src='/assets/tobby-hello.webp' mode='aspectFit' /></View>
    <View className='section-block'><View className='section-title'><Text className='section-heading-text'>精选推荐</Text><Button className='section-more' onClick={() => openSearch()}>查看全部 <Glyph name='chevron' /></Button></View>{items === undefined ? <View className='inline-loading'>托比正在整理书架…</View> : items.length ? <View className='book-row'>{items.slice(0, 5).map((item) => <BookTile key={item.id} listing={item} href={`/pages/listing/detail?id=${item.id}`} />)}</View> : <View className='inline-state compact'><Image src='/assets/tobby-question.webp' mode='aspectFit' /><Text className='inline-title'>还没有上架的书</Text><Button className='secondary-button' onClick={() => navigationAdapter.switchTab('/pages/search/index')}>看看其他分类</Button></View>}</View>
    {items && items.length > 0 && <View className='ranking-card'><View className='section-title'><Text className='section-heading-text'>最近上架</Text><Text className='section-note'>最新流动好书</Text></View>{items.slice(0, 3).map((item, index) => <RankItem key={item.id} listing={item} index={index} href={`/pages/listing/detail?id=${item.id}`} />)}</View>}
  </AppShell>
}
