import { Image, Text, View } from '@tarojs/components'

import { assets } from '../../assets'
import { CURRENT_USER_ID } from '../../domain/demo-data'
import type { User } from '../../domain/types'

const avatarMap: Record<string, string> = {
  avatarLin: assets.avatarLin,
  avatarZhou: assets.avatarZhou,
  avatarJian: assets.avatarJian,
}

export function Avatar({ user, size = 42 }: { user: User; size?: number }) {
  const src = user.id === CURRENT_USER_ID ? assets.tobbyHello : user.avatar ? avatarMap[user.avatar] : undefined
  return (
    <View className={`avatar avatar-${user.avatarTone} ${user.id === CURRENT_USER_ID ? 'image-avatar' : ''}`} style={{ width: `${size}px`, height: `${size}px` }}>
      {src ? <Image src={src} mode='aspectFit' /> : <Text>{user.name.slice(0, 1)}</Text>}
    </View>
  )
}

export function TobbyBubble({ image = assets.tobbyHello, title = 'Tobby 提醒', children, compact = false }: { image?: string; title?: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <View className={`tobby-bubble ${compact ? 'compact' : ''}`}>
      <Image src={image} mode='aspectFit' />
      <View><Text className='tobby-bubble-title'>{title}</Text><Text>{children}</Text></View>
    </View>
  )
}
