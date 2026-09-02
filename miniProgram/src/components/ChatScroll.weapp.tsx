import type { PropsWithChildren } from 'react'
import { ScrollView } from '@tarojs/components'

export function ChatScroll({ children, className, scrollIntoView }: PropsWithChildren<{ className: string; scrollIntoView: string }>) {
  return <ScrollView scrollY scrollWithAnimation className={className} scrollIntoView={scrollIntoView}>{children}</ScrollView>
}
