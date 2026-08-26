import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'

import { assets } from '../../assets'
import { Brand } from '../../components/BrandHeader'
import { Glyph } from '../../components/Glyph'
import { demoRepository } from '../../repository/demo-repository'
import { navigationAdapter, routes } from '../../platform/navigation'

export default function WelcomePage() {
  useDidShow(() => {
    demoRepository.isOnboardingComplete().then((done) => {
      if (done) void navigationAdapter.replace(routes.home)
    })
  })
  const start = () => navigationAdapter.to(routes.onboarding)
  return (
    <View className='phone-shell welcome-page'>
      <View className='welcome-decoration' />
      <View className='welcome-brand'><Brand /><View className='leaf-seal'>❧</View></View>
      <View className='welcome-copy'><View className='hello-pill'>你好呀，我是托比 ❧</View><View className='welcome-title'>欢迎来到你的{`\n`}<Text>校园二手书小站</Text></View><Text>搜索闲置教材、发布旧书、站内联系，{`\n`}在校内安心完成交易。</Text></View>
      <Image className='welcome-tobby' src={assets.tobbyMaster} mode='aspectFit' />
      <View className='welcome-steps'>
        {[
          ['01', 'search', '找书', '搜索教材与参考书'], ['02', 'message', '联系', '站内沟通更方便'], ['03', 'book', '交易', '线下见面更安心'],
        ].map(([number, icon, title, text]) => <View key={number}><Text>{number}</Text><Glyph name={icon as 'search'} /><View>{title}</View><Text>{text}</Text></View>)}
      </View>
      <View className='welcome-actions'><Button id='e2e-welcome-start' className='primary-button' onClick={start}>进入 BITerStore</Button><Button className='secondary-button' onClick={start}>先看看如何使用</Button><Text>❧ 北理工校内试运行中 ❧</Text></View>
    </View>
  )
}
