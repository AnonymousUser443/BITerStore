import { Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'

export function useToast() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 2200)
    return () => clearTimeout(timer)
  }, [message])
  return { message, show: setMessage }
}

export function Toast({ message }: { message: string }) {
  if (!message) return null
  return <View className='toast' role='status'><Text>❧</Text><Text>{message}</Text></View>
}
