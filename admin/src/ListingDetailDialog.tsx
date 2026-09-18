import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { apiBlob, apiRequest } from './api'
import type { ListingDetail } from './types'

function ReviewImage({ id, label }: { id: string; label: string }) {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    void apiBlob(`/media/review/${encodeURIComponent(id)}`).then((blob) => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id])
  return <figure>{url ? <img src={url} alt={label} /> : <p>{error ? '图片加载失败，请重新打开详情重试' : '正在加载图片…'}</p>}<figcaption>{label}</figcaption></figure>
}

const statuses: Record<string, string> = { PENDING_REVIEW: '待审核', CHANGES_REQUESTED: '待修改', ACTIVE: '在售', RESERVED: '已预订', SOLD: '已售', OFF_SHELF: '已下架', BLOCKED: '违规屏蔽', DRAFT: '草稿' }
export function listingReviewPath(id: string) { return `/admin/listings/${encodeURIComponent(id)}` }

export function ListingDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [listing, setListing] = useState<ListingDetail>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setListing(undefined); setError('')
    void apiRequest<ListingDetail>(listingReviewPath(id)).then((value) => { if (active) setListing(value) }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '详情加载失败') })
    return () => { active = false }
  }, [id, attempt])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="dialog-backdrop" onClick={onClose}><section className="dialog-panel listing-review-dialog" role="dialog" aria-modal="true" aria-labelledby="listing-detail-title" onClick={(event) => event.stopPropagation()}>
    <button className="dialog-close" aria-label="关闭详情" onClick={onClose}><X size={18} /></button>
    <p className="eyebrow">商品审核详情</p><h2 id="listing-detail-title">{listing?.title || '商品详情'}</h2>
    {error ? <div role="alert"><p>{error}</p><button className="secondary" onClick={() => setAttempt((value) => value + 1)}>重试</button></div> : !listing ? <p role="status">正在加载详情…</p> : <>
      <p className="status">{statuses[listing.status] || listing.status}{listing.deletedAt ? ' · 已删除' : ''}</p>
      {listing.moderationReason && <div className="selected-action-note"><strong>最近处理原因</strong><span>{listing.moderationReason}</span></div>}
      <dl className="user-detail-grid">{[['作者', listing.author || '未填写'], ['ISBN', listing.isbn || '未填写'], ['售价', `¥${(listing.priceCents / 100).toFixed(2)}`], ['原价', listing.originalPriceCents == null ? '未填写' : `¥${(listing.originalPriceCents / 100).toFixed(2)}`], ['品相', listing.condition], ['校区', listing.campus], ['分类', listing.category], ['课程', listing.course || '未填写'], ['卖家', listing.seller.nickname], ['发布时间', new Date(listing.createdAt).toLocaleString('zh-CN')]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3>书籍简介</h3><p className="listing-description">{listing.description || '未填写简介'}</p><p>{listing.tags.map((tag) => `#${tag}`).join(' ')}</p>
      <h3>商品图片与 ISBN 凭证</h3><div className="review-gallery">{listing.images.map((image) => <ReviewImage key={image.id} id={image.id} label={image.role === 'ISBN' ? 'ISBN 凭证（仅审核可见）' : image.role === 'COVER' ? '封面' : '补充实拍'} />)}</div>
    </>}
  </section></div>
}
