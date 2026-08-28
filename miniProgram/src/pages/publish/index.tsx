import { useEffect, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { Button, Image, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import { AppShell, BookCover } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { listingAssistant } from '@/domain/assistant'
import { apiRequest } from '@/domain/api'
import { demoRepository } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import type { BookMetadata, Campus, Condition, PublishDraft } from '@/domain/types'
import { feedbackAdapter, isbnRecognitionAdapter, mediaAdapter, navigationAdapter } from '@/platform'

const categories = ['教材教辅', '专业课', '考研考公', '文学小说']
const conditions: Condition[] = ['全新', '九成新', '八成新', '七成新及以下']
const campuses: Campus[] = ['中关村', '良乡', '西山', '珠海']
const emptyDraft: PublishDraft = { title: '', author: '', isbn: '', category: '教材教辅', course: '', price: '', originalPrice: '', condition: '九成新', campus: '良乡', description: '', tags: [], mediaIds: [] }

export default function PublishPage() {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState(emptyDraft)
  const [aiLoading, setAiLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  useDidShow(() => { void requireAccount('请先使用学号登录后发布商品') })
  useEffect(() => { void demoRepository.getDraft().then((saved) => saved && setDraft({ ...saved, coverMediaId: saved.coverMediaId || saved.mediaIds[0], isbnMediaId: saved.isbnMediaId || saved.mediaIds[1] })) }, [])
  useEffect(() => { void mediaAdapter.list().then((items) => setPreviews(Object.fromEntries(items.filter((item) => draft.mediaIds.includes(item.id)).map((item) => [item.id, item.uri])))) }, [draft.mediaIds])
  const patch = (next: Partial<PublishDraft>) => setDraft((current) => ({ ...current, ...next }))
  const pickRole = async (role: 'coverMediaId' | 'isbnMediaId') => {
    const selected = await mediaAdapter.pick({ count: 1, cameraOnly: true }); const saved = await mediaAdapter.persist(selected); const item = saved[0]; if (!item) return
    const previous = draft[role]; if (previous) await mediaAdapter.remove([previous])
    const rest = draft.mediaIds.filter((id) => id !== previous && id !== item.id)
    const cover = role === 'coverMediaId' ? item.id : draft.coverMediaId
    const isbn = role === 'isbnMediaId' ? item.id : draft.isbnMediaId
    patch({ [role]: item.id, mediaIds: [cover, isbn, ...rest].filter(Boolean).slice(0, 6) as string[] })
  }
  const pick = async () => { const selected = await mediaAdapter.pick({ count: Math.max(1, 6 - draft.mediaIds.length) }); const saved = await mediaAdapter.persist(selected); patch({ mediaIds: [...draft.mediaIds, ...saved.map((item) => item.id)].slice(0, 6) }) }
  const generate = async () => {
    if (!draft.coverMediaId || !draft.isbnMediaId) { await feedbackAdapter.toast('请先拍摄封面和 ISBN 页'); return }
    setAiLoading(true)
    let recognizedIsbn = ''
    try {
      const isbn = await isbnRecognitionAdapter.scan(previews[draft.isbnMediaId])
      recognizedIsbn = isbn
      patch({ isbn })
      const metadata = __API_URL__ && !__BITERSTORE_E2E__
        ? await apiRequest<BookMetadata>(`/books/isbn/${isbn}`)
        : { isbn, title: '高等数学（第七版）上册', author: '同济大学数学系 编', publisher: '高等教育出版社', publishDate: '', coverUrl: '', subjects: ['教材'] }
      const category = metadata.subjects.some((value) => /文学|小说|fiction/i.test(value)) ? '文学小说' : '教材教辅'
      const result = await listingAssistant.generate({ ...draft, title: metadata.title, course: draft.course || metadata.title })
      patch({ ...result, title: metadata.title, author: metadata.author || draft.author, isbn: metadata.isbn, category, course: draft.course || metadata.title, description: `${metadata.title}${metadata.author ? `，${metadata.author}著` : ''}。${draft.condition}，支持校内当面验书。`, tags: Array.from(new Set([...result.tags, ...metadata.subjects.slice(0, 2)])) })
      await feedbackAdapter.toast('已识别 ISBN 并补全书籍信息')
      setStep(2)
    } catch (cause) {
      if (recognizedIsbn) {
        patch({ isbn: recognizedIsbn })
        await feedbackAdapter.toast('已识别 ISBN；书目信息暂未查到，请手动补全')
        setStep(2)
      } else await feedbackAdapter.toast(cause instanceof Error ? cause.message : '识别失败，请重试')
    }
    finally { setAiLoading(false) }
  }
  const validate = () => { const next = [!draft.title && '请填写书名', !draft.author && '请填写作者', !draft.price && '请填写价格', !draft.description && '请填写商品简介'].filter(Boolean) as string[]; setErrors(next); return next.length === 0 }
  const next = async () => { if (step === 1) { if (!draft.coverMediaId || !draft.isbnMediaId) return feedbackAdapter.toast('封面和 ISBN 页均为必拍项'); setStep(2) } else if (validate()) setStep(3) }
  const save = async () => { await demoRepository.saveDraft(draft); await feedbackAdapter.toast('草稿已保存') }
  const publish = async () => { if (!validate()) return setStep(2); try { await demoRepository.publishListing(draft); await navigationAdapter.go('/pages/states/index?type=success') } catch (cause) { await feedbackAdapter.toast(cause instanceof Error ? cause.message : '发布失败，请稍后重试') } }
  const removeImage = async (id: string) => { await mediaAdapter.remove([id]); patch({ mediaIds: draft.mediaIds.filter((value) => value !== id), ...(draft.coverMediaId === id ? { coverMediaId: undefined } : {}), ...(draft.isbnMediaId === id ? { isbnMediaId: undefined } : {}) }) }

  return <AppShell title='发布闲置书籍' active='publish' className='publish-page'>
    <View className='stepper'>{['上传图片', '填写信息', '确认发布'].map((label, index) => <View className={`stepper-item ${step >= index + 1 ? 'active' : ''}`} key={label}><Text className='stepper-number'>{index + 1}</Text><Text className='stepper-label'>{label}</Text>{index < 2 && <Text className='stepper-line' />}</View>)}</View>
    {step === 1 && <><View className='upload-card'><Text className='upload-heading'>两张必拍照片</Text><Text className='upload-instruction'>请对准拍摄，文字与条码保持清晰，发布时会再次校验。</Text><View className='required-image-grid'><RequiredImage id='e2e-publish-media' label='书籍封面' hint='必拍 · 用作商品首图' mediaId={draft.coverMediaId} preview={draft.coverMediaId ? previews[draft.coverMediaId] : undefined} onPick={() => pickRole('coverMediaId')} onRemove={removeImage} /><RequiredImage label='ISBN 页' hint='必拍 · 对准条形码' mediaId={draft.isbnMediaId} preview={draft.isbnMediaId ? previews[draft.isbnMediaId] : undefined} onPick={() => pickRole('isbnMediaId')} onRemove={removeImage} /></View><View className='optional-images'><Text>其他实拍图（选填，最多 4 张）</Text><View className='image-grid'>{draft.mediaIds.filter((id) => id !== draft.coverMediaId && id !== draft.isbnMediaId).map((id, index) => <View className='upload-preview' key={id}>{previews[id] ? <Image src={previews[id]} mode='aspectFill' /> : <Text>图片 {index + 1}</Text>}<Button aria-label={`移除图片 ${index + 1}`} onClick={() => removeImage(id)}>×</Button></View>)}{draft.mediaIds.length < 6 && <Button className='add-image' onClick={pick}><Glyph name='camera' /><Text className='add-image-title'>补充图片</Text><Text className='add-image-copy'>书脊、内页或瑕疵</Text></Button>}</View></View><View className='tobby-tip'><Image src='/assets/tobby-guide-publish.webp' mode='aspectFit' /><Text>封面和 ISBN 页拍清楚，托比就能帮你补全信息～</Text></View></View><View className='ai-card'><View><Text className='ai-title'>✦ Tobby 一键识别</Text><Text className='ai-copy'>免费识别 ISBN 条码，查询书名、作者与分类；识别结果可修改。</Text></View><Button id='e2e-publish-tobby-ai' disabled={aiLoading || !draft.coverMediaId || !draft.isbnMediaId} onClick={generate}>{aiLoading ? '识别中…' : '✦ 一键识别生成'}</Button></View></>}
    {step === 2 && <View className='form-card'><Field label='书名' required error={errors.includes('请填写书名')}><Input id='e2e-publish-title' value={draft.title} onInput={(event) => patch({ title: event.detail.value })} /></Field><View className='form-grid'><Field label='作者' required error={errors.includes('请填写作者')}><Input value={draft.author} onInput={(event) => patch({ author: event.detail.value })} /></Field><Field label='ISBN'><Input value={draft.isbn} onInput={(event) => patch({ isbn: event.detail.value })} /></Field><Field label='课程 / 分类' required><Picker mode='selector' range={categories} onChange={(event) => patch({ category: categories[Number(event.detail.value)] })}><View className='select-control'>{draft.category}</View></Picker></Field><Field label='成色' required><Picker mode='selector' range={conditions} onChange={(event) => patch({ condition: conditions[Number(event.detail.value)] })}><View className='select-control'>{draft.condition}</View></Picker></Field><Field label='价格' required error={errors.includes('请填写价格')}><Input id='e2e-publish-price' type='number' value={draft.price} onInput={(event) => patch({ price: event.detail.value })} placeholder='¥ 0.00' /></Field><Field label='校区' required><Picker mode='selector' range={campuses} onChange={(event) => patch({ campus: campuses[Number(event.detail.value)] })}><View className='select-control'>{draft.campus}</View></Picker></Field></View><Field label='商品简介' required error={errors.includes('请填写商品简介')}><Textarea value={draft.description} onInput={(event) => patch({ description: event.detail.value })} maxlength={300} /></Field><View className='tag-picker'><Text>添加标签</Text>{['考研必备', '期末复习', '笔记少', '教材'].map((tag) => <Button className={draft.tags.includes(tag) ? 'active' : ''} onClick={() => patch({ tags: draft.tags.includes(tag) ? draft.tags.filter((value) => value !== tag) : [...draft.tags, tag] })} key={tag}>{tag}</Button>)}</View>{errors.length > 0 && <View className='form-error'>! {errors.join('、')}</View>}</View>}
    {step === 3 && <View className='publish-preview'><Text className='eyebrow'>发布前最后确认</Text><View className='preview-listing'><BookCover listing={{ id: 'preview', title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, price: Number(draft.price || 0), originalPrice: Number(draft.originalPrice || draft.price || 0), condition: draft.condition, campus: draft.campus, description: draft.description, status: 'available', sellerId: 'user-tobby', createdAt: '', tags: draft.tags, tone: 'sage', mediaIds: draft.mediaIds }} /></View><View className='safety-note'>◈ 请确认图片和描述真实准确，联系方式仅对发起咨询的同学可见。</View></View>}
    <View className='publish-actions'>{step === 2 && <Button id='e2e-publish-save' className='secondary-button' onClick={save}>保存草稿</Button>}{step > 1 && <Button className='secondary-button' onClick={() => setStep(step - 1)}>上一步</Button>}<Button id='e2e-publish-submit' className='primary-button' onClick={step === 3 ? publish : next}>{step === 3 ? '发布上架' : '下一步'}</Button></View>
  </AppShell>
}

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: boolean }) {
  return <View className={`form-field ${error ? 'error' : ''}`}><Text className='form-label'>{required ? '* ' : ''}{label}</Text>{children}</View>
}

function RequiredImage({ id, label, hint, mediaId, preview, onPick, onRemove }: { id?: string; label: string; hint: string; mediaId?: string; preview?: string; onPick(): void; onRemove(id: string): void }) {
  return <View className={`required-image ${mediaId ? 'complete' : ''}`}>{mediaId ? <View className='upload-preview'><Image src={preview} mode='aspectFill' /><Text className='image-role'>{label} ✓</Text><Button aria-label={`移除${label}`} onClick={() => onRemove(mediaId)}>×</Button></View> : <Button id={id} className='required-image-button' onClick={onPick}><Glyph name='camera' /><Text>{label}</Text><Text>{hint}</Text></Button>}</View>
}
