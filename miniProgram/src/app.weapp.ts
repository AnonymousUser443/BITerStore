import type { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import { demoRepository, warmAccountSnapshots } from '@/domain/repository'
import './golden.css'
import './app.css'

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    Taro.onPageNotFound(() => { void Taro.redirectTo({ url: '/pages/states/index?type=not-found' }) })
    void demoRepository.getAuthenticatedSid().then((sid) => { if (sid && sid !== 'guest') return warmAccountSnapshots() })
  })
  return children
}
