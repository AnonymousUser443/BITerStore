import type { PropsWithChildren } from 'react'
import { View } from '@tarojs/components'

export function ChatScroll({ children, className }: PropsWithChildren<{ className: string; scrollIntoView: string }>) {
  return <View className={className}>{children}</View>
}
