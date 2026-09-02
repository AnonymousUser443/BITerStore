import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { StartupScreen } from '@/components/StartupScreen'
import { demoRepository } from '@/domain/repository'
import { isAssetBundleReady, prepareAssetBundle } from '@/platform'

export default function StartupPage() {
  const [progress, setProgress] = useState(isAssetBundleReady() ? 100 : 0)
  const bootstrapStarted = useRef(false)

  useEffect(() => {
    if (bootstrapStarted.current) return
    bootstrapStarted.current = true
    let active = true
    void (async () => {
      try {
        const cached = isAssetBundleReady()
        if (!cached) await prepareAssetBundle((value) => { if (active) setProgress(value) })
        const onboarded = await demoRepository.isOnboardingComplete()
        if (!active) return
        if (onboarded) await Taro.reLaunch({ url: '/pages/home/index' })
        else await Taro.reLaunch({ url: '/pages/welcome/index' })
      } catch {
        if (!active) return
        setProgress(100)
        await Taro.reLaunch({ url: '/pages/welcome/index' }).catch(() => undefined)
      }
    })()
    return () => { active = false }
  }, [])

  return <StartupScreen progress={progress} />
}
