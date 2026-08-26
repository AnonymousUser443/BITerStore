import { useEffect, useState } from 'react'
import { Button, Image, Text, View } from '@tarojs/components'
import { Brand, Modal } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { demoRepository } from '@/domain/repository'
import { navigationAdapter } from '@/platform'

export default function WelcomePage() {
  const [notice, setNotice] = useState(false)
  useEffect(() => { void demoRepository.shouldShowResetNotice().then(setNotice) }, [])
  const start = async () => { const done = await demoRepository.isOnboardingComplete(); await (done ? navigationAdapter.switchTab('/pages/home/index') : navigationAdapter.go('/pages/onboarding/index')) }
  return <View className='phone-shell welcome-page'>
    <View className='welcome-decoration' />
    <View className='welcome-brand'><Brand /><Text className='leaf-seal'><Glyph name='leaf' /></Text></View>
    <View className='welcome-copy'><Text className='welcome-greeting'>你好呀，我是托比 <Glyph name='leaf' /></Text><Text className='welcome-title'>欢迎来到你的{process.env.TARO_ENV === 'h5' ? '\n' : ' '}<Text className='welcome-accent'>校园二手书小站</Text></Text><Text className='welcome-description'>搜索闲置教材、发布旧书、站内联系，{process.env.TARO_ENV === 'h5' ? '\n' : ' '}在校内安心完成交易。</Text></View>
    <Image className='welcome-tobby' src='/assets/tobby-master-transparent.webp' mode='aspectFit' />
    <View className='welcome-steps'><View className='welcome-step'><Text className='step-number'>01</Text><Glyph name='search' /><Text className='step-title'>找书</Text><Text className='step-copy'>搜索教材与参考书</Text></View><View className='welcome-step'><Text className='step-number'>02</Text><Glyph name='message' /><Text className='step-title'>联系</Text><Text className='step-copy'>站内沟通更方便</Text></View><View className='welcome-step'><Text className='step-number'>03</Text><Glyph name='trade' /><Text className='step-title'>交易</Text><Text className='step-copy'>线下见面更安心</Text></View></View>
    <View className='welcome-actions'><Button id='e2e-welcome-start' className='primary-button' onClick={start}>进入 BITerStore</Button><Button className='secondary-button' onClick={() => navigationAdapter.go('/pages/onboarding/index')}>先看看如何使用</Button><Text className='welcome-footnote'>❧ 北理工校内试运行中 ❧</Text></View>
    <Modal open={notice} title='欢迎来到新版 BITerStore' onClose={() => { void demoRepository.acknowledgeResetNotice(); setNotice(false) }}><Text>新版使用独立演示数据，不会读取或删除旧 H5 的收藏、草稿和消息。</Text></Modal>
  </View>
}
