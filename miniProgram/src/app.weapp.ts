import type { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import './golden.css'
import './app.css'

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    Taro.onPageNotFound(() => { void Taro.redirectTo({ url: '/pages/states/index?type=not-found' }) })
  })
  return children
}
