import { PropsWithChildren, useEffect } from 'react'
import Taro from '@tarojs/taro'
import '../../web/app/globals.css'
import './h5.css'

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    const onExpired = () => { void Taro.redirectTo({ url: '/pages/login/index?expired=1' }) }
    globalThis.addEventListener?.('biterstore:auth-expired', onExpired)
    return () => globalThis.removeEventListener?.('biterstore:auth-expired', onExpired)
  }, [])
  return children
}
export default App
