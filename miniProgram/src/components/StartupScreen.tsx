import { Image, Text, View } from '@tarojs/components'
import { Brand } from './ui'

export function StartupScreen({ progress }: { progress: number }) {
  const isH5 = process.env.TARO_ENV === 'h5'
  return <View className='phone-shell boot-screen'>
    <Image className='paper-texture' src='/assets/paper-bg.webp' mode='aspectFill' />
    <View className='boot-brand'><Brand /><Text>移动校园书站</Text></View>
    <View className='boot-visual'><View className='boot-orbit-dot' /><Image src='/assets/tobby-cheer.webp' mode='aspectFit' /></View>
    <View className='boot-copy'>
      <Text className='boot-kicker'>APP RESOURCE PACK</Text>
      <Text className='boot-title'>{isH5 ? '托比正在从服务器\n下载 App 资源包……' : '托比正在准备 App 资源包……'}</Text>
      <Text className='boot-description'>{isH5 ? '第一次见面会稍久一点，之后打开就会快很多。' : '界面与托比素材已包含在小程序中，马上就准备好啦。'}</Text>
    </View>
    <View className='boot-progress'><View className='boot-progress-value' style={{ width: `${Math.max(5, progress)}%` }} /></View>
    <View className='boot-status'><Text>正在初始化界面与角色素材</Text><Text className='boot-percent'>{progress}%</Text></View>
    <Text className='boot-footnote'>请稍候，书页马上就准备好啦 ❧</Text>
  </View>
}
