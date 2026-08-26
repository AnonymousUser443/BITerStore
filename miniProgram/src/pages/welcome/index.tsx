import { useEffect, useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { AppShell, Modal, Tobby } from '@/components/ui'
import { demoRepository } from '@/domain/repository'
import { navigationAdapter } from '@/platform'

export default function WelcomePage() {
  const [notice, setNotice] = useState(false)
  useEffect(() => { void demoRepository.shouldShowResetNotice().then(setNotice) }, [])
  const start = async () => { const done = await demoRepository.isOnboardingComplete(); await (done ? navigationAdapter.switchTab('/pages/home/index') : navigationAdapter.go('/pages/onboarding/index')) }
  return <AppShell className='welcome-page'><View className='hero-card'><View className='hero-copy'><Text className='muted'>北京理工大学校园二手书</Text><Text className='section-title'>让每一本书，继续被需要。</Text><Text className='muted'>找教材、发布闲置、校内沟通，一次完成。</Text></View><Tobby mood='hello' /></View><View className='section-row'><Text className='section-title'>从一本书开始</Text></View><View className='stats'><View className='stat'><Text><strong>校内</strong>可信场景</Text></View><View className='stat'><Text><strong>当面</strong>验书交易</Text></View><View className='stat'><Text><strong>循环</strong>减少闲置</Text></View></View><Button id='e2e-welcome-start' className='primary-button' onClick={start}>开始逛逛</Button><Modal open={notice} title='欢迎来到新版 BITerStore' onClose={() => { void demoRepository.acknowledgeResetNotice(); setNotice(false) }}><Text>新版使用独立演示数据，不会读取或删除旧 H5 的收藏、草稿和消息。</Text></Modal></AppShell>
}
