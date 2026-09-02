import { useCallback, useMemo, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { bundledAsset } from '@/assets'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import { preserveSnapshot } from '@/domain/snapshot'
import type { Listing, ListingStatus } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

export default function MyListingsPage() {
  const [tab, setTab] = useState<ListingStatus | 'all'>('all')
  const [items, setItems] = useState<Listing[] | undefined>(() => demoRepository.peekMyListings())
  const [deleteTarget, setDeleteTarget] = useState<Listing>()
  const [deletingId, setDeletingId] = useState<string>()
  const load = useCallback(() => demoRepository.listMyListings().then((next) => setItems((current) => preserveSnapshot(current, next))), [])
  useDidShow(() => { void requireAccount('请先使用学号登录后管理商品').then((allowed) => { if (allowed) return load() }) })
  const visible = useMemo(() => items === undefined ? undefined : tab === 'all' ? items : items.filter((item) => item.status === tab), [items, tab])
  const change = async (item: Listing) => { await demoRepository.updateListingStatus(item.id, item.status === 'available' ? 'sold' : 'available'); await load() }
  const confirmRemove = async () => {
    if (!deleteTarget || deletingId) return
    setDeletingId(deleteTarget.id)
    try { await demoRepository.deleteListing(deleteTarget.id); setItems((current) => current?.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(undefined); await feedbackAdapter.toast('已删除这本书') }
    catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '删除失败，请稍后重试') }
    finally { setDeletingId(undefined) }
  }
  const dialog = deleteTarget ? <View className='dialog-layer'><Button className='dialog-scrim' aria-label='取消删除' onClick={() => !deletingId && setDeleteTarget(undefined)} /><View className='confirm-dialog'><View className='confirm-dialog-copy'><Text className='confirm-warning'><Glyph name='warning' /></Text><View><Text className='confirm-title'>确认删除这本书？</Text><Text className='confirm-copy'>《{deleteTarget.title}》删除后不会再公开展示。</Text></View></View><View className='confirm-dialog-actions'><Button className='secondary-button' disabled={Boolean(deletingId)} onClick={() => setDeleteTarget(undefined)}>取消</Button><Button id='e2e-listing-delete-confirm' className='danger-button' disabled={Boolean(deletingId)} onClick={confirmRemove}>{deletingId ? '删除中…' : '确认删除'}</Button></View></View></View> : undefined
  return <AppShell title='我的发布' back className='simple-list-page' overlay={dialog}><View className='status-tabs'>{([['all', '全部'], ['available', '在售'], ['sold', '已售'], ['offline', '下架']] as const).map(([value, label]) => <Button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>{label}</Button>)}</View>{visible === undefined ? <View className='inline-state'><Image src={bundledAsset('tobby-search')} mode='aspectFit' /><Text className='inline-title'>托比正在整理书架…</Text></View> : visible.length ? visible.map((item) => <View className='manage-listing' key={item.id}><ListingCard listing={item} href={`/pages/listing/detail?id=${item.id}`} ownerView /><View className={`manage-listing-actions${['available', 'offline'].includes(item.status) ? '' : ' single-action'}`}>{['available', 'offline'].includes(item.status) && <Button className='secondary-button' onClick={() => change(item)}>{item.status === 'available' ? '标记已售' : '重新上架'}</Button>}<Button className='danger-button' onClick={() => setDeleteTarget(item)}>删除</Button></View></View>) : <View id='e2e-my-listings-empty' className='inline-state'><Image src={bundledAsset('tobby-question')} mode='aspectFit' /><Text className='inline-title'>这次没有找到合适的书</Text><Text className='inline-copy'>换个状态，或者发布一本闲置书吧。</Text></View>}<Button className='floating-add' onClick={() => navigationAdapter.switchTab('/pages/publish/index')}>＋ 发布一本书</Button></AppShell>
}
