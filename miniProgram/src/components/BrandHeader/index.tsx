import { Button, Text, View } from '@tarojs/components'

import { navigationAdapter, routes } from '../../platform/navigation'
import { Glyph } from '../Glyph'

export function Brand() {
  return <View className='brand'><View className='brand-mark'><Text>◖</Text><Text>◗</Text></View><Text>BITerStore</Text></View>
}

export function BrandHeader({ title, back = false }: { title?: string; back?: boolean }) {
  return (
    <View className={`topbar ${title ? 'page-topbar' : ''}`}>
      <Button className={back ? 'round-button' : 'brand-button'} onClick={() => back ? navigationAdapter.back() : navigationAdapter.to(routes.home)} aria-label={back ? '返回' : '返回首页'}>
        {back ? <Glyph name='back' /> : <Brand />}
      </Button>
      {title && <View className='topbar-title'>{title}</View>}
      <View className='top-actions'>
        <Button className='icon-button' aria-label='通知'><Glyph name='bell' /><View className='notification-dot' /></Button>
        {title ? <Button className='icon-button leaf-action' aria-label='品牌快捷入口'>❧</Button> : <View className='mini-avatar'>托</View>}
      </View>
    </View>
  )
}
