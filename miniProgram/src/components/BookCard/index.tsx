import { Button, Text, View } from '@tarojs/components'

import { formatPrice, listingStatusLabel } from '../../domain/constants'
import { getUser } from '../../domain/demo-data'
import type { Book } from '../../domain/types'
import { navigationAdapter, routes } from '../../platform/navigation'
import { Glyph } from '../Glyph'
import { Avatar } from '../Tobby'

export function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  return (
    <View className={`book-cover tone-${book.tone} ${compact ? 'compact' : ''}`}>
      <Text className='cover-emblem'>❧</Text>
      <Text className='book-cover-title'>{book.title}</Text>
      {!compact && <Text className='book-cover-foot'>BITerStore 校园藏书</Text>}
    </View>
  )
}

export function BookTile({ book }: { book: Book }) {
  return (
    <View className='book-tile' onClick={() => navigationAdapter.to(routes.bookDetail, { id: book.id })}>
      <BookCover book={book} />
      <View className='book-tile-title'>{book.title}</View>
      <Text className='book-tile-author'>{book.author}</Text>
      <View className='book-meta'><Text>¥{formatPrice(book.price)}</Text><Text>{book.condition.slice(0, 2)}</Text></View>
    </View>
  )
}

export function BookListCard({ book, favorite = false, onFavorite, manageAction }: { book: Book; favorite?: boolean; onFavorite?: (book: Book) => void; manageAction?: React.ReactNode }) {
  const seller = getUser(book.sellerId)
  return (
    <View className={`listing-card ${book.status !== 'available' ? 'unavailable-card' : ''}`}>
      <View className='listing-main' onClick={() => navigationAdapter.to(routes.bookDetail, { id: book.id })}>
        <BookCover book={book} compact />
        <View className='listing-copy'>
          <View className='listing-heading'><View>{book.title}</View><Glyph name='more' /></View>
          <Text className='listing-author'>{book.author}</Text>
          <View className='listing-price'><Text>¥{formatPrice(book.price)}</Text><Text>¥{formatPrice(book.originalPrice)}</Text><Text>{book.condition}</Text></View>
          <View className='listing-detail'><Text><Glyph name='pin' />{book.campus}校区</Text><Text><Glyph name='book' />{book.course}</Text></View>
          <View className='seller-line'><Avatar user={seller} size={24} /><Text>{seller.name}</Text><Text className='rating'>★ 4.9分</Text></View>
        </View>
      </View>
      <View className='listing-actions'>
        <Button onClick={() => onFavorite?.(book)}><Glyph name='heart' />{favorite ? '已收藏' : '收藏'}</Button>
        <Button onClick={() => navigationAdapter.to(routes.chat, { bookId: book.id })}><Glyph name='message' />联系卖家</Button>
        <Button className='detail-action' onClick={() => navigationAdapter.to(routes.bookDetail, { id: book.id })}>详情 <Glyph name='chevron' /></Button>
      </View>
      {manageAction}
      <Text className={`status-badge status-${book.status}`}>{listingStatusLabel[book.status]}</Text>
    </View>
  )
}
