import { useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { Brand } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import { navigationAdapter } from '@/platform'

const steps = [
  { mood: 'guide-search' as const, title: '快速找到一本书', text: '使用搜索栏与分类入口，按课程、ISBN 或书名找到需要的教材。', targets: ['搜索栏', '分类筛选', '推荐书籍'] },
  { mood: 'question' as const, title: '看懂商品与状态', text: '价格、成色、校区和卖家信息一目了然，已售商品会清晰标注。', targets: ['商品信息', '收藏与联系', '交易状态'] },
  { mood: 'guide-trade' as const, title: '发布并完成交易', text: '从底栏一键发布，站内联系同学，再约在校内安心见面。', targets: ['发布入口', '消息中心', '个人中心'] }
]
export default function OnboardingPage() {
  const [index, setIndex] = useState(0)
  const step = steps[index]
  const complete = async () => { await demoRepository.completeOnboarding(); await navigationAdapter.go('/pages/login/index') }
  const next = async () => { if (index < steps.length - 1) setIndex(index + 1); else await complete() }
  return <View className='phone-shell onboarding-page'>
    <View className='onboarding-preview'><View className='fake-brand'><Brand /></View><View className='fake-search' /><View className='fake-hero' /><View className='fake-cards'><Text /><Text /><Text /></View><View className='fake-nav' /></View><View className='onboarding-scrim' />
    <View className='onboarding-panel'><View className='onboarding-heading'><Text>新手指引 {index + 1}/3</Text><Button onClick={complete}>跳过</Button></View><Image className='onboarding-tobby' src={`/assets/tobby-${step.mood}.webp`} mode='aspectFit' /><View className='guide-card'><Text className='guide-step'>STEP 0{index + 1}</Text><Text className='guide-title'>{step.title}</Text><Text className='guide-copy'>{step.text}</Text><View className='guide-pills'>{step.targets.map((target) => <Text key={target}><Glyph name='check' />{target}</Text>)}</View></View><View className='step-dots'>{steps.map((_, dot) => <Text className={dot === index ? 'active' : ''} key={dot} />)}</View><View className='guide-actions'>{index > 0 && <Button className='secondary-button' onClick={() => setIndex(index - 1)}>上一步</Button>}<Button id='e2e-onboarding-next' className='primary-button' onClick={next}>{index === 2 ? '开始使用' : '下一步'}</Button></View></View>
  </View>
}
