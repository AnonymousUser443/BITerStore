import { useEffect, type PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import { demoRepository, warmAccountSnapshots } from '@/domain/repository'
import './golden.css'
import './app.css'

export default function App({ children }: PropsWithChildren) {
  useEffect(() => {
    const eventCenter = (Taro as unknown as { eventCenter?: { on?: (event: string, handler: () => void) => void; off?: (event: string, handler: () => void) => void } }).eventCenter
    const onExpired = () => { void Taro.reLaunch({ url: '/pages/login/index?expired=1' }) }
    eventCenter?.on?.('biterstore:auth-expired', onExpired)
    return () => eventCenter?.off?.('biterstore:auth-expired', onExpired)
  }, [])
  useLaunch(() => {
    Taro.onPageNotFound(() => { void Taro.redirectTo({ url: '/pages/states/index?type=not-found' }) })
    void demoRepository.getAuthenticatedSid().then((sid) => { if (sid && sid !== 'guest') return warmAccountSnapshots() })
  })
  return children
}
