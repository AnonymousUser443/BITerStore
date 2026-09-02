import { PropsWithChildren, ReactNode, useEffect, useState } from 'react'
import { Button, Image, Input, Navigator, Text, View } from '@tarojs/components'
import { bundledAsset, isNetworkWebp } from '@/assets'
import { demoRepository, getUser } from '@/domain/repository'
import { CURRENT_USER_ID } from '@/domain/seed'
import { beginNavigationFeedback, markNavigationReady, navigationAdapter } from '@/platform'
import type { Listing, ListingStatus } from '@/domain/types'
import { ChatScroll } from './ChatScroll'
import { Glyph } from './Glyph'

export function Brand() {
  return <View className='brand'><View className='brand-mark'><View className='brand-leaf' /><View className='brand-leaf' /></View><Text className='brand-label'>BITerStore</Text></View>
}

export function BrandHeader({ title, back = false, backTo, action }: { title?: string; back?: boolean; backTo?: string; action?: ReactNode }) {
  const [current, setCurrent] = useState(getUser(CURRENT_USER_ID))
  useEffect(() => { void demoRepository.getAuthenticatedSid().then((id) => id && id !== 'guest' ? demoRepository.getProfile().then(setCurrent) : undefined).catch(() => undefined) }, [])
  return <View className={`topbar brand-header ${title ? 'page-topbar page-header' : ''} ${back ? 'back-header' : 'root-header'}`}>
    {back ? <Button id='e2e-header-back' className='round-button' onClick={() => backTo ? navigationAdapter.switchTab(backTo) : navigationAdapter.back()}><Glyph name='back' /></Button> : <Button className='brand-button' onClick={() => navigationAdapter.switchTab('/pages/home/index')}><Brand /></Button>}
    {title && <Text className='page-title'>{title}</Text>}
    <View className='top-actions header-actions'>{action || <><Button className='icon-button header-icon'><Glyph name='bell' /><Text className='notification-dot' /></Button>{!title && <Avatar user={current} size={38} />}{title && <Button className='icon-button leaf-action'><Glyph name={back ? 'more' : 'leaf'} /></Button>}</>}</View>
  </View>
}

export function Avatar({ user, size = 42 }: { user: ReturnType<typeof getUser>; size?: number }) {
  const source = user.id === CURRENT_USER_ID ? bundledAsset('tobby-hello') : user.avatar
  return <View className={`avatar avatar-${user.avatarTone || 'sage'} ${user.id === CURRENT_USER_ID ? 'image-avatar' : ''}`} style={{ width: `${size}px`, height: `${size}px` }}>{source ? <Image className='avatar-image' src={source} webp={isNetworkWebp(source)} mode={user.id === CURRENT_USER_ID ? 'aspectFit' : 'aspectFill'} /> : <Text className='avatar-initial'>{user.name.slice(0, 1)}</Text>}</View>
}

const appTabs: ReadonlyArray<readonly [string, string, string]> = [['home', '首页', 'home'], ['search', '分类', 'grid'], ['publish', '发布', 'send'], ['messages', '消息', 'chat'], ['profile', '我的', 'user']]
function AppNavigation({ active }: { active?: string }) {
  if (process.env.TARO_ENV !== 'h5') return null
  return <View className='bottom-nav h5-navigation'>{appTabs.map(([route, label, icon]) => <Button key={route} id={`e2e-nav-${route}`} className={`nav-item ${active === route ? 'active' : ''} ${route === 'publish' ? 'publish' : ''}`} onClick={() => navigationAdapter.switchTab(`/pages/${route}/index`)}><View className={`nav-icon ${icon}`} /><Text>{label}</Text></Button>)}</View>
}

export function AppShell({ children, title, back, backTo, active, className = '', noNav = false, scrollIntoView, overlay }: PropsWithChildren<{ title?: string; back?: boolean; backTo?: string; active?: string; className?: string; noNav?: boolean; scrollIntoView?: string; overlay?: ReactNode }>) {
  markNavigationReady()
  const shouldGoBack = back || active === 'publish'
  const destination = backTo || (active === 'publish' ? '/pages/home/index' : undefined)
  const nativeChrome = process.env.TARO_ENV === 'weapp'
  const hideNavigation = noNav || className === 'detail-page'
  const contentClassName = `content-scroll page-scroll ${hideNavigation ? 'no-nav' : ''}`
  const content = scrollIntoView
    ? <ChatScroll className={contentClassName} scrollIntoView={scrollIntoView}>{children}</ChatScroll>
    : <View className={contentClassName}>{children}</View>
  return <View className={`phone-shell app-shell ${nativeChrome ? 'native-chrome' : ''} ${className}`}><Image className='paper-texture' src={bundledAsset('paper-bg')} mode='aspectFill' />{!nativeChrome && <BrandHeader title={title} back={shouldGoBack} backTo={destination} />}{content}{overlay}{!hideNavigation && <AppNavigation active={active} />}</View>
}

export type TobbyMood = 'hello' | 'search' | 'heart' | 'question' | 'sad' | 'maintenance' | 'cheer' | 'guide-search' | 'guide-publish' | 'guide-trade' | 'unavailable' | 'master' | 'master-transparent' | 'news'
export function Tobby({ mood = 'hello', caption, className = '' }: { mood?: TobbyMood; caption?: string; className?: string }) { return <View className={`tobby ${className}`}><Image mode='aspectFit' src={bundledAsset(`tobby-${mood}`)} />{caption && <Text>{caption}</Text>}</View> }
export function StatusTag({ status }: { status: ListingStatus }) { const labels: Record<ListingStatus, string> = { available: '可交易', sold: '已售', offline: '已下架', draft: '草稿', reviewing: '待审核' }; return <Text className={`status-tag ${status}`}>{labels[status]}</Text> }

export function BookCover({ listing, compact = false }: { listing: Listing; compact?: boolean }) {
  const cover = listing.imageUrls?.[0]
  return <View className={`book-cover ${listing.tone} ${compact ? 'compact' : ''} ${cover ? 'has-image' : ''}`}>{cover ? <Image className='book-cover-image' src={cover} webp={isNetworkWebp(cover)} mode='aspectFill' /> : <><Text className='cover-leaf'>❧</Text><Text className='cover-title'>{listing.title}</Text>{!compact && <Text className='cover-caption'>BITerStore 校园藏书</Text>}</>}</View>
}

export function BookTile({ listing, href, onTap }: { listing: Listing; href?: string; onTap?: () => void }) {
  const content = <><BookCover listing={listing} /><Text className='tile-title'>{listing.title}</Text><Text className='tile-author'>{listing.author}</Text><View className='book-meta'><Text className='book-price'>¥{listing.price.toFixed(2)}</Text><Text className='book-campus'>{listing.campus}</Text></View></>
  return href ? <Navigator className='book-tile' url={href} onClick={() => beginNavigationFeedback(href)}>{content}</Navigator> : <Button className='book-tile' onClick={onTap}>{content}</Button>
}

export function ListingCard({ listing, href, onTap, favorite = false, onFavorite, onContact, ownerView = false }: { listing: Listing; href?: string; onTap?: () => void; favorite?: boolean; onFavorite?: () => void; onContact?: () => void; ownerView?: boolean }) {
  const seller = listing.seller || getUser(listing.sellerId)
  const sellerAvatar = seller.avatar || bundledAsset('avatar-jian')
  const main = <><BookCover listing={listing} compact /><View className='listing-copy'><View className='listing-heading'><Text className='listing-title'>{listing.title}</Text><Glyph name='more' className='more-glyph' /></View><Text className='listing-author'>{listing.author}</Text><View className='listing-price'><Text className='price-current'>¥{listing.price.toFixed(2)}</Text><Text className='price-original'>¥{listing.originalPrice.toFixed(2)}</Text><Text className='condition'>{listing.condition}</Text></View><View className='listing-detail'><Text>⌖ {listing.campus}校区</Text><Text>▥ {listing.course}</Text></View><View className='seller-line'><Image className='seller-avatar' src={sellerAvatar} webp={isNetworkWebp(sellerAvatar)} mode='aspectFill' /><Text>{seller.name}</Text><Glyph name='shield' /><Text>{seller.verified ? '已认证' : '校园用户'}</Text></View></View></>
  return <View className={`listing-card ${listing.status !== 'available' ? 'unavailable-card' : ''}`}>
    {href ? <Navigator id={`e2e-listing-${listing.id}`} className='listing-main' url={href} onClick={() => beginNavigationFeedback(href)}>{main}</Navigator> : <Button id={`e2e-listing-${listing.id}`} className='listing-main' onClick={onTap}>{main}</Button>}
    {!ownerView && <View className='listing-actions'><Button onClick={onFavorite}><Glyph name='heart' />{favorite ? '已收藏' : '收藏'}</Button><Button onClick={onContact}><Glyph name='message' />联系卖家</Button><Button className='detail-action' onClick={href ? () => { void navigationAdapter.go(href) } : onTap}>详情 <Glyph name='chevron' /></Button></View>}<Text className={`status-badge ${listing.status}`}>{{ available: '可交易', sold: '已售', offline: '已下架', draft: '草稿', reviewing: '待审核' }[listing.status]}</Text>
  </View>
}

export function RankItem({ listing, index, href, onTap }: { listing: Listing; index: number; href?: string; onTap?: () => void }) {
  const content = <><Text className='rank-number'>0{index + 1}</Text><BookCover listing={listing} compact /><View className='rank-copy'><Text>{listing.title}</Text><Text>{listing.author}</Text><Text>{listing.campus}校区 · {listing.condition}</Text></View><View className='rank-price'><Text>¥{listing.price}</Text><Text>查看详情</Text></View><Glyph name='chevron' /></>
  return href ? <Navigator className='rank-item' url={href} onClick={() => beginNavigationFeedback(href)}>{content}</Navigator> : <Button className='rank-item' onClick={onTap}>{content}</Button>
}

export function FormField({ label, value, placeholder, onInput, type = 'text', id }: { label: string; value: string; placeholder?: string; onInput: (value: string) => void; type?: 'text' | 'number'; id?: string }) { return <View className='form-field'><Text>{label}</Text><Input id={id} type={type} value={value} placeholder={placeholder} onInput={(event) => onInput(event.detail.value)} /></View> }
export function Toast({ children }: PropsWithChildren) { return <View className='inline-toast'>{children}</View> }
export function Modal({ open, title, children, onClose }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) { if (!open) return null; return <View className='modal-mask' onClick={onClose}><View className='modal-card' onClick={(event) => event.stopPropagation()}><Text className='section-title'>{title}</Text>{children}<Button id='e2e-modal-close' onClick={onClose}>知道了</Button></View></View> }
export function FilterDrawer({ open, children, onClose }: PropsWithChildren<{ open: boolean; onClose: () => void }>) { if (!open) return null; return <View className='drawer-mask' onClick={onClose}><View className='filter-drawer' onClick={(event) => event.stopPropagation()}>{children}</View></View> }
