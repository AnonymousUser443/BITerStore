import { Button, Image, ScrollView, Text, View } from '@tarojs/components'

import { assets } from '../../assets'
import { AppShell } from '../../components/AppShell'
import { BookCover, BookTile } from '../../components/BookCard'
import { Glyph } from '../../components/Glyph'
import { categories } from '../../domain/constants'
import { seedBooks } from '../../domain/demo-data'
import { navigationAdapter, routes } from '../../platform/navigation'

export default function HomePage() {
  return (
    <AppShell active='home' className='home-page'>
      <View id='e2e-home-search-entry' className='search-box' onClick={() => navigationAdapter.to(routes.search)}>
        <Glyph name='search' /><Text>搜索书名、作者或 ISBN</Text><Glyph name='filter' />
      </View>
      <ScrollView scrollX enhanced showScrollbar={false} className='category-chips'>
        <View className='chip-row'>{categories.map((category, index) => <Button className={`chip ${index === 0 ? 'active' : ''}`} onClick={() => navigationAdapter.to(routes.search, { category })} key={category}>{category}</Button>)}</View>
      </ScrollView>
      <View className='hero-card'>
        <View className='hero-copy'>
          <Text className='eyebrow'>书页轻翻 · 好物续航</Text>
          <View className='hero-title'>以书会友{`\n`}共享知识之美</View>
          <Text>让每一本闲置书，遇见下一位需要它的人。</Text>
          <Button className='hero-button' onClick={() => navigationAdapter.to(routes.search)}>探索好书 <Text>→</Text></Button>
        </View>
        <Image className='hero-tobby' src={assets.tobbyHello} mode='aspectFit' />
        <Text className='corner-emblem'>❧</Text>
      </View>
      <View className='section-block'>
        <View className='section-title'><View>精选推荐</View><Button className='section-more' onClick={() => navigationAdapter.to(routes.search)}>查看全部 <Glyph name='chevron' /></Button></View>
        <ScrollView scrollX enhanced showScrollbar={false} className='book-row'><View className='book-row-inner'>{seedBooks.slice(0, 5).map((book) => <BookTile book={book} key={book.id} />)}</View></ScrollView>
      </View>
      <View className='ranking-card'>
        <View className='section-title'><View>校园热榜</View><Text>本周流动好书</Text></View>
        {seedBooks.slice(0, 3).map((book, index) => (
          <View className='rank-item' onClick={() => navigationAdapter.to(routes.bookDetail, { id: book.id })} key={book.id}>
            <Text className='rank-number'>0{index + 1}</Text><BookCover book={book} compact />
            <View className='rank-copy'><View>{book.title}</View><Text>{book.author}</Text><Text>{book.campus}校区 · {book.condition}</Text></View>
            <View className='rank-price'><Text>¥{book.price}</Text><Text>查看详情</Text></View><Glyph name='chevron' />
          </View>
        ))}
      </View>
    </AppShell>
  )
}
