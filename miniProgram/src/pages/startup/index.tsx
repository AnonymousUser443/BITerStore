import { useState } from 'react'
import Taro, { useLoad } from '@tarojs/taro'
import { StartupScreen } from '@/components/StartupScreen'
import { demoRepository } from '@/domain/repository'
import { isAssetBundleReady, prepareAssetBundle } from '@/platform'

export default function StartupPage() {
  const [progress, setProgress] = useState(isAssetBundleReady() ? 100 : 0)

  useLoad(() => {
    void (async () => {
      const cached = isAssetBundleReady()
      if (!cached) {
        const startedAt = Date.now()
        await prepareAssetBundle(setProgress)
        const remaining = 650 - (Date.now() - startedAt)
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
      }
      const onboarded = await demoRepository.isOnboardingComplete()
      if (onboarded) await Taro.switchTab({ url: '/pages/home/index' })
      else await Taro.reLaunch({ url: '/pages/welcome/index' })
    })()
  })

  return <StartupScreen progress={progress} />
}
