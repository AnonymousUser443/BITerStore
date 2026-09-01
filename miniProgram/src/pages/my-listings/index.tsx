import { useCallback, useMemo, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { AppShell, ListingCard } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import { preserveSnapshot } from '@/domain/snapshot'
import type { Listing, ListingStatus } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

export default function MyListingsPage() {
  const [tab, setTab] = useState<ListingStatus | 'all'>('all')
  const [items, setItems] = useState<Listing[] | undefined>(() => demoRepository.peekMyListings())
  const [confirmingSoldId, setConfirmingSoldId] = useState<string>()
  const [updatingId, setUpdatingId] = useState<string>()
  const load = useCallback(() => demoRepository.listMyListings().then((next) => setItems((current) => preserveSnapshot(current, next))), [])
  useDidShow(() => { void requireAccount('请先使用学号登录后管理商品').then((allowed) => { if (allowed) return load() }) })
  const visible = useMemo(() => items === undefined ? undefined : tab === 'all' ? items : items.filter((item) => item.status === tab), [items, tab])
  const updateStatus = async (item: Listing, status: ListingStatus) => {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      await demoRepository.updateListingStatus(item.id, status)
      setConfirmingSoldId(undefined)
      await feedbackAdapter.toast(status === 'sold' ? '已标记为已售' : '已重新上架')
      await load()
    } catch (cause) {
      await feedbackAdapter.toast(cause instanceof Error ? cause.message : '状态更新失败，请稍后重试')
    } finally {
      setUpdatingId(undefined)
    }
  }
  const change = (item: Listing) => {
    if (item.status === 'available') setConfirmingSoldId(item.id)
    else void updateStatus(item, 'available')
  }
  const remove = async (item: Listing) => { if (!await feedbackAdapter.confirm('删除发布', `确定删除《${item.title}》吗？删除后不会再公开展示。`)) return; await demoRepository.deleteListing(item.id); await feedbackAdapter.toast('已删除这本书'); await load() }
  return <AppShell title='我的发布' back className='simple-list-page'><View className='status-tabs'>{([['all', '全部'], ['available', '在售'], ['sold', '已售'], ['offline', '下架']] as const).map(([value, label]) => <Button className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setConfirmingSoldId(undefined) }} key={value}>{label}</Button>)}</View>{visible === undefined ? <View className='inline-state'><Image src='/assets/tobby-search.webp' mode='aspectFit' /><Text className='inline-title'>托比正在整理书架…</Text></View> : visible.length ? visible.map((item) => {
    const confirmingSold = confirmingSoldId === item.id
    const updating = updatingId === item.id
    return <View id={`e2e-my-listing-${item.id}`} className='manage-listing' key={item.id}><ListingCard listing={item} href={`/pages/listing/detail?id=${item.id}`} ownerView /><View className={`manage-listing-actions${['available', 'offline'].includes(item.status) ? '' : ' single-action'}`}>{confirmingSold ? <><Button id={`e2e-cancel-sold-${item.id}`} className='secondary-button' disabled={updating} onClick={() => setConfirmingSoldId(undefined)}>取消</Button><Button id={`e2e-confirm-sold-${item.id}`} className='danger-button' disabled={updating} onClick={() => { void updateStatus(item, 'sold') }}>{updating ? '更新中…' : '确认已售'}</Button></> : <>{['available', 'offline'].includes(item.status) && <Button id={item.status === 'available' ? `e2e-mark-sold-${item.id}` : undefined} className='secondary-button' disabled={Boolean(updatingId)} onClick={() => change(item)}>{item.status === 'available' ? '标记已售' : updating ? '更新中…' : '重新上架'}</Button>}<Button className='danger-button' disabled={Boolean(updatingId)} onClick={() => remove(item)}>删除</Button></>}</View></View>
  }) : <View id='e2e-my-listings-empty' className='inline-state'><Image src='/assets/tobby-question.webp' mode='aspectFit' /><Text className='inline-title'>这次没有找到合适的书</Text><Text className='inline-copy'>换个状态，或者发布一本闲置书吧。</Text></View>}<Button className='floating-add' onClick={() => navigationAdapter.switchTab('/pages/publish/index')}>＋ 发布一本书</Button></AppShell>
}
