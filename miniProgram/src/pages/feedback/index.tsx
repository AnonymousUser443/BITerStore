import { useState } from 'react'
import { Button, Image, Text, Textarea, View } from '@tarojs/components'
import { AppShell } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import type { FeedbackType } from '@/domain/types'
import { feedbackAdapter, navigationAdapter } from '@/platform'

const choices: Array<{ type: FeedbackType; title: string; detail: string; glyph: 'warning' | 'sparkle' }> = [
  { type: 'BUG', title: '提交 Bug', detail: '功能异常、页面错误或无法完成操作', glyph: 'warning' },
  { type: 'SUGGESTION', title: '提交建议', detail: '功能想法、体验优化或其他建议', glyph: 'sparkle' }
]

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>()
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const detail = content.trim()
    if (!type) return feedbackAdapter.toast('请先选择提交 Bug 或提交建议')
    if (detail.length < 2) return feedbackAdapter.toast('请至少填写 2 个字符')
    setSubmitting(true)
    try {
      await demoRepository.submitFeedback(type, detail)
      await feedbackAdapter.toast('反馈已提交，感谢你的帮助')
      await navigationAdapter.back()
    } catch (cause) {
      await feedbackAdapter.toast(cause instanceof Error ? cause.message : '反馈提交失败，请稍后重试')
    } finally { setSubmitting(false) }
  }

  return <AppShell title='问题反馈' back noNav className='feedback-page'>
    <View className='feedback-intro'><Image src='/assets/tobby-question.webp' mode='aspectFit' /><View><Text className='eyebrow'>HELP US IMPROVE</Text><Text className='feedback-title'>遇到问题，或有好点子？</Text><Text className='feedback-copy'>选择反馈类型并告诉我们具体情况，管理员会在后台查看。</Text></View></View>
    <View className='feedback-form'>
      <Text className='feedback-section-title'>反馈类型</Text>
      <View className='feedback-choices'>{choices.map((choice) => <Button id={`e2e-feedback-${choice.type.toLowerCase()}`} key={choice.type} className={type === choice.type ? 'selected' : ''} onClick={() => setType(choice.type)}><Text className='feedback-choice-icon'><Glyph name={choice.glyph} /></Text><View><Text>{choice.title}</Text><Text>{choice.detail}</Text></View><Text className='feedback-choice-check'>{type === choice.type ? '✓' : ''}</Text></Button>)}</View>
      <View className='feedback-field'><Text>反馈内容</Text><Textarea id='e2e-feedback-content' maxlength={1000} value={content} onInput={(event) => setContent(event.detail.value)} placeholder={type === 'BUG' ? '请描述出现问题的页面、操作步骤和现象' : type === 'SUGGESTION' ? '请描述你希望增加或改进的内容' : '请先选择反馈类型，再填写具体内容'} /><Text>{content.trim().length}/1000</Text></View>
      <Text className='feedback-note'><Glyph name='shield' />反馈会关联你的账号，便于确认问题；不会公开展示。</Text>
      <Button id='e2e-feedback-submit' className='primary-button feedback-submit' disabled={!type || content.trim().length < 2 || submitting} onClick={submit}>{submitting ? '正在提交…' : '提交反馈'}</Button>
    </View>
  </AppShell>
}
