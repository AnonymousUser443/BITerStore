import { Image, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { assets, criticalAssets } from './assets'
import { cacheAdapter } from './platform/cache'
import './app.scss'

function BootScreen({ progress }: { progress: number }) {
  return (
    <View className='boot-screen' aria-live='polite'>
      <View className='boot-brand'><Text className='brand-mark'>◖◗</Text><Text className='brand-word'>BITerStore</Text><Text>移动校园书站</Text></View>
      <View className='boot-orbit'><View className='boot-ring' /><Image src={assets.tobbyCheer} mode='aspectFit' /></View>
      <View className='boot-copy'>
        <Text>APP RESOURCE PACK</Text>
        <View className='boot-title'>托比正在准备{process.env.TARO_ENV === 'h5' ? ' App 资源包' : '界面与角色素材'}……</View>
        <Text>第一次见面会稍久一点，之后打开就会快很多。</Text>
      </View>
      <View className='boot-progress'><View style={{ width: `${Math.max(5, progress)}%` }} /></View>
      <View className='boot-status'><Text>正在初始化界面与角色素材</Text><Text>{progress}%</Text></View>
      <Text className='boot-foot'>请稍候，书页马上就准备好啦 ❧</Text>
    </View>
  )
}

function App({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let active = true
    const started = Date.now()
    cacheAdapter.isReady().then(async (cached) => {
      if (cached) {
        if (active) { setProgress(100); setReady(true) }
        return
      }
      await cacheAdapter.warm(criticalAssets, (value) => active && setProgress(value))
      const remaining = Math.max(0, 700 - (Date.now() - started))
      if (remaining) await new Promise((resolve) => setTimeout(resolve, remaining))
      if (active) { setProgress(100); setReady(true) }
    })
    return () => { active = false }
  }, [])

  return <View className='app-stage'>{ready ? children : <BootScreen progress={progress} />}</View>
}

export default App
