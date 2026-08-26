import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { AppShell, Tobby } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import { navigationAdapter } from '@/platform'

const steps = [
  { mood: 'guide-search' as const, title: '找到正好需要的书', text: '按课程、校区、成色与价格组合筛选。' },
  { mood: 'guide-publish' as const, title: 'Tobby 帮你快速发布', text: '添加图片和基本信息，一键补全文案。' },
  { mood: 'guide-trade' as const, title: '校内沟通更安心', text: '站内联系，在公共区域当面验书。' }
]
export default function OnboardingPage() { const [index, setIndex] = useState(0); const step = steps[index]; const next = async () => { if (index < steps.length - 1) setIndex(index + 1); else { await demoRepository.completeOnboarding(); await navigationAdapter.switchTab('/pages/home/index') } }; return <AppShell title='新手引导' back><View className='paper-card profile-hero'><Tobby mood={step.mood} /><Text className='section-title'>{step.title}</Text><Text className='muted'>{step.text}</Text><View className='chip-row'>{steps.map((_, i) => <Text key={i} className={`chip ${i === index ? 'active' : ''}`}>{i + 1}</Text>)}</View><Button id='e2e-onboarding-next' className='primary-button' onClick={next}>{index === 2 ? '进入首页' : '下一步'}</Button></View></AppShell> }
