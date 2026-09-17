import { PropsWithChildren, useEffect } from 'react'
import Taro from '@tarojs/taro'
import '../../web/app/globals.css'
import './h5.css'

function getStoredAuthenticatedSid() {
  if (typeof localStorage === 'undefined') return ''
  try {
    return JSON.parse(localStorage.getItem('biterstore:v1:authenticated-sid') || '""') as string
  } catch {
    return ''
  }
}

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    const onExpired = () => {
      const sid = getStoredAuthenticatedSid()
      if (!sid || sid === 'guest') return
      void Taro.redirectTo({ url: '/pages/login/index?expired=1' })
    }
    globalThis.addEventListener?.('biterstore:auth-expired', onExpired)
    return () => globalThis.removeEventListener?.('biterstore:auth-expired', onExpired)
  }, [])
  return children
}
export default App
