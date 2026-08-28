import { useEffect, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { Button, Image, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import { AppShell, BookCover } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { listingAssistant } from '@/domain/assistant'
import { demoRepository } from '@/domain/repository'
import { requireAccount } from '@/domain/access'
import type { Campus, Condition, PublishDraft } from '@/domain/types'
import { feedbackAdapter, mediaAdapter, navigationAdapter } from '@/platform'

const categories = ['教材教辅', '专业课', '考研考公', '文学小说']
const conditions: Condition[] = ['全新', '九成新', '八成新', '七成新及以下']
const campuses: Campus[] = ['中关村', '良乡', '西山', '珠海']
const emptyDraft: PublishDraft = { title: '', author: '', isbn: '', category: '教材教辅', course: '', price: '', originalPrice: '', condition: '九成新', campus: '良乡', description: '', tags: [], mediaIds: [] }

export default function PublishPage() {
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState(emptyDraft)
  const [aiLoading, setAiLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  useDidShow(() => { void requireAccount('请先使用学号登录后发布商品') })
  useEffect(() => { void demoRepository.getDraft().then((saved) => saved && setDraft(saved)) }, [])
  const patch = (next: Partial<PublishDraft>) => setDraft((current) => ({ ...current, ...next }))
  const pick = async () => { const selected = await mediaAdapter.pick(); const saved = await mediaAdapter.persist(selected); patch({ mediaIds: [...draft.mediaIds, ...saved.map((item) => item.id)].slice(0, 6) }) }
  const generate = async () => { setAiLoading(true); const result = await listingAssistant.generate(draft); patch({ ...result, author: draft.author || '同济大学数学系 编', isbn: draft.isbn || '978-7-5608-9493-7', category: '教材教辅', course: draft.course || '高等数学', price: draft.price || '26', originalPrice: draft.originalPrice || '49.8', condition: '九成新' }); setAiLoading(false); setStep(2) }
  const validate = () => { const next = [!draft.title && '请填写书名', !draft.author && '请填写作者', !draft.price && '请填写价格', !draft.description && '请填写商品简介'].filter(Boolean) as string[]; setErrors(next); return next.length === 0 }
  const next = () => { if (step === 1) setStep(2); else if (validate()) setStep(3) }
  const save = async () => { await demoRepository.saveDraft(draft); await feedbackAdapter.toast('草稿已保存') }
  const publish = async () => { if (!validate()) return setStep(2); await demoRepository.publishListing(draft); await navigationAdapter.go('/pages/states/index?type=success') }

  return <AppShell title='发布闲置书籍' active='publish' className='publish-page'>
    <View className='stepper'>{['上传图片', '填写信息', '确认发布'].map((label, index) => <View className={`stepper-item ${step >= index + 1 ? 'active' : ''}`} key={label}><Text className='stepper-number'>{index + 1}</Text><Text className='stepper-label'>{label}</Text>{index < 2 && <Text className='stepper-line' />}</View>)}</View>
    {step === 1 && <><View className='upload-card'><View className='image-grid'>{draft.mediaIds.map((id, index) => <View className='upload-preview' key={id}><Text>图片 {index + 1}</Text></View>)}<Button id='e2e-publish-media' className='add-image' onClick={pick}><Glyph name='camera' /><Text className='add-image-title'>添加图片</Text><Text className='add-image-copy'>最多 6 张</Text></Button></View><View className='tobby-tip'><Image src='/assets/tobby-guide-publish.webp' mode='aspectFit' /><Text>拍下封面，托比来帮你补全信息～</Text></View></View><View className='ai-card'><View><Text className='ai-title'>✦ Tobby 一键成文</Text><Text className='ai-copy'>上传封面后，自动生成书名、ISBN、分类与简介。</Text></View><Button id='e2e-publish-tobby-ai' onClick={generate}>{aiLoading ? '识别中…' : '✦ 一键识别生成'}</Button></View></>}
    {step === 2 && <View className='form-card'><Field label='书名' required error={errors.includes('请填写书名')}><Input id='e2e-publish-title' value={draft.title} onInput={(event) => patch({ title: event.detail.value })} /></Field><View className='form-grid'><Field label='作者' required error={errors.includes('请填写作者')}><Input value={draft.author} onInput={(event) => patch({ author: event.detail.value })} /></Field><Field label='ISBN'><Input value={draft.isbn} onInput={(event) => patch({ isbn: event.detail.value })} /></Field><Field label='课程 / 分类' required><Picker mode='selector' range={categories} onChange={(event) => patch({ category: categories[Number(event.detail.value)] })}><View className='select-control'>{draft.category}</View></Picker></Field><Field label='成色' required><Picker mode='selector' range={conditions} onChange={(event) => patch({ condition: conditions[Number(event.detail.value)] })}><View className='select-control'>{draft.condition}</View></Picker></Field><Field label='价格' required error={errors.includes('请填写价格')}><Input id='e2e-publish-price' type='number' value={draft.price} onInput={(event) => patch({ price: event.detail.value })} placeholder='¥ 0.00' /></Field><Field label='校区' required><Picker mode='selector' range={campuses} onChange={(event) => patch({ campus: campuses[Number(event.detail.value)] })}><View className='select-control'>{draft.campus}</View></Picker></Field></View><Field label='商品简介' required error={errors.includes('请填写商品简介')}><Textarea value={draft.description} onInput={(event) => patch({ description: event.detail.value })} maxlength={300} /></Field><View className='tag-picker'><Text>添加标签</Text>{['考研必备', '期末复习', '笔记少', '教材'].map((tag) => <Button className={draft.tags.includes(tag) ? 'active' : ''} onClick={() => patch({ tags: draft.tags.includes(tag) ? draft.tags.filter((value) => value !== tag) : [...draft.tags, tag] })} key={tag}>{tag}</Button>)}</View>{errors.length > 0 && <View className='form-error'>! {errors.join('、')}</View>}</View>}
    {step === 3 && <View className='publish-preview'><Text className='eyebrow'>发布前最后确认</Text><View className='preview-listing'><BookCover listing={{ id: 'preview', title: draft.title, author: draft.author, isbn: draft.isbn, category: draft.category, course: draft.course, price: Number(draft.price || 0), originalPrice: Number(draft.originalPrice || draft.price || 0), condition: draft.condition, campus: draft.campus, description: draft.description, status: 'available', sellerId: 'user-tobby', createdAt: '', tags: draft.tags, tone: 'sage', mediaIds: draft.mediaIds }} /></View><View className='safety-note'>◈ 请确认图片和描述真实准确，联系方式仅对发起咨询的同学可见。</View></View>}
    <View className='publish-actions'>{step === 2 && <Button id='e2e-publish-save' className='secondary-button' onClick={save}>保存草稿</Button>}{step > 1 && <Button className='secondary-button' onClick={() => setStep(step - 1)}>上一步</Button>}<Button id='e2e-publish-submit' className='primary-button' onClick={step === 3 ? publish : next}>{step === 3 ? '发布上架' : '下一步'}</Button></View>
  </AppShell>
}

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: boolean }) {
  return <View className={`form-field ${error ? 'error' : ''}`}><Text className='form-label'>{required ? '* ' : ''}{label}</Text>{children}</View>
}
