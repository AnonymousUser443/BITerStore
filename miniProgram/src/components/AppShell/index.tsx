import { ScrollView, View } from '@tarojs/components'
import type { ViewProps } from '@tarojs/components'
import type { PropsWithChildren } from 'react'

import { BottomNav } from '../BottomNav'
import type { NavKey } from '../BottomNav'
import { BrandHeader } from '../BrandHeader'

interface AppShellProps extends PropsWithChildren {
  active?: NavKey
  title?: string
  back?: boolean
  noNav?: boolean
  className?: string
  scrollProps?: Partial<ViewProps>
}

export function AppShell({ children, active, title, back = false, noNav = false, className = '', scrollProps }: AppShellProps) {
  const showH5Nav = !noNav && process.env.TARO_ENV === 'h5'
  return (
    <View className={`phone-shell ${className}`}>
      <View className='paper-texture' />
      <BrandHeader title={title} back={back || active === 'publish'} />
      <ScrollView scrollY enhanced showScrollbar={false} className={`content-scroll ${noNav ? 'no-nav' : ''}`} {...scrollProps}>
        {children}
      </ScrollView>
      {showH5Nav && <BottomNav active={active} />}
    </View>
  )
}
