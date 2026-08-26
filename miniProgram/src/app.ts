import { PropsWithChildren } from 'react'
import Taro, { useLaunch } from '@tarojs/taro'
import { prepareAssetBundle } from './platform'
import './app.css'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    void prepareAssetBundle()
    Taro.onPageNotFound(() => { void Taro.redirectTo({ url: '/pages/states/index?type=not-found' }) })
  })
  return children
}
export default App
