import { useEffect, useState } from 'react'
import { Button, Picker, Text, Textarea, View } from '@tarojs/components'
import { AppShell, FormField, Toast, Tobby } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { listingAssistant } from '@/domain/assistant'
import { demoRepository } from '@/domain/repository'
import type { Campus, Condition, PublishDraft } from '@/domain/types'
import { feedbackAdapter, mediaAdapter, navigationAdapter } from '@/platform'

const emptyDraft: PublishDraft = { title: '', author: '', isbn: '', category: '计算机', course: '', price: '', originalPrice: '', condition: '八成新', campus: '良乡', description: '', tags: [], mediaIds: [] }
export default function PublishPage() {
  const [draft, setDraft] = useState(emptyDraft)
  const [message, setMessage] = useState('')
  useEffect(() => { void demoRepository.getDraft().then((saved) => saved && setDraft(saved)) }, [])
  const patch = (next: Partial<PublishDraft>) => setDraft((current) => ({ ...current, ...next }))
  const pick = async () => { const selected = await mediaAdapter.pick(); const saved = await mediaAdapter.persist(selected); patch({ mediaIds: [...draft.mediaIds, ...saved.map((x) => x.id)] }); setMessage(`已添加 ${saved.length} 张图片`) }
  const generate = async () => { const result = await listingAssistant.generate(draft); patch(result); setMessage('Tobby 已补全标题、描述和标签') }
  const save = async () => { await demoRepository.saveDraft(draft); await feedbackAdapter.toast('草稿已保存') }
  const publish = async () => { try { const item = await demoRepository.publishListing(draft); await navigationAdapter.go(`/pages/states/index?type=success&id=${item.id}`) } catch (cause) { setMessage(cause instanceof Error ? cause.message : '发布失败') } }

  return <AppShell title='发布闲置' active='publish' className='publish-page'>
    <View className='publish-stepper'><View className='active'><Text>1</Text><Text>书籍信息</Text></View><View><Text>2</Text><Text>预览确认</Text></View><View><Text>3</Text><Text>发布完成</Text></View></View>
    <View className='upload-card'><View className='upload-heading'><View><Text className='section-title'>添加书籍图片</Text><Text>最多 6 张，首张图片会作为封面</Text></View><Text>{draft.mediaIds.length}/6</Text></View><View className='image-grid'><Button id='e2e-publish-media' className='image-picker' onClick={pick}><Glyph name='image' /><Text>添加图片</Text></Button>{draft.mediaIds.map((id, index) => <View className='image-placeholder' key={id}><Glyph name='book' /><Text>图片 {index + 1}</Text></View>)}</View><View className='ai-card'><Tobby mood='guide-publish' /><View><Text>Tobby 智能成文</Text><Text>根据书名和书况，帮你整理标题、描述与标签。</Text></View><Button id='e2e-publish-tobby-ai' onClick={generate}><Glyph name='sparkle' /> 一键成文</Button></View></View>
    <View className='form-card'><Text className='section-title'>书籍信息</Text><FormField id='e2e-publish-title' label='书名' value={draft.title} onInput={(title) => patch({ title })} placeholder='例如：高等数学（第七版）上册' /><View className='form-grid two'><FormField label='作者' value={draft.author} onInput={(author) => patch({ author })} /><FormField label='课程' value={draft.course} onInput={(course) => patch({ course })} /></View><FormField label='ISBN' value={draft.isbn} onInput={(isbn) => patch({ isbn })} /><View className='form-grid two'><FormField id='e2e-publish-price' label='售价' type='number' value={draft.price} onInput={(price) => patch({ price })} /><FormField label='原价' type='number' value={draft.originalPrice} onInput={(originalPrice) => patch({ originalPrice })} /></View><View className='form-grid two'><Picker mode='selector' range={['全新', '九成新', '八成新', '七成新及以下']} onChange={(e) => patch({ condition: ['全新', '九成新', '八成新', '七成新及以下'][Number(e.detail.value)] as Condition })}><View className='select-field'><Text>成色</Text><Text>{draft.condition}⌄</Text></View></Picker><Picker mode='selector' range={['中关村', '良乡', '西山', '珠海']} onChange={(e) => patch({ campus: ['中关村', '良乡', '西山', '珠海'][Number(e.detail.value)] as Campus })}><View className='select-field'><Text>校区</Text><Text>{draft.campus}⌄</Text></View></Picker></View><View className='form-field'><Text>描述</Text><Textarea value={draft.description} onInput={(e) => patch({ description: e.detail.value })} placeholder='描述书况、笔记情况和取书方式' /></View>{message && <Toast>{message}</Toast>}<View className='publish-actions'><Button id='e2e-publish-save' className='secondary-button' onClick={save}>保存草稿</Button><Button id='e2e-publish-submit' className='primary-button' onClick={publish}>预览并发布 <Glyph name='chevron' /></Button></View></View>
  </AppShell>
}
