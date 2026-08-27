import { Image, Text, View } from '@tarojs/components'

export function StartupScreen({ progress }: { progress: number }) {
  return <View className='startup-screen'>
    <View className='startup-glow' />
    <View className='startup-brand'>
      <View className='startup-mark'><Text>◖</Text><Text>◗</Text></View>
      <Text className='startup-name'>BITerStore</Text>
    </View>
    <Image className='startup-tobby' src='/assets/tobby-master-transparent.webp' mode='aspectFit' />
    <View className='startup-copy'>
      <Text className='startup-title'>托比正在准备 App 资源包……</Text>
      <Text className='startup-subtitle'>把书页、插图和校园故事轻轻放好</Text>
    </View>
    <View className='startup-progress'><View className='startup-progress-value' style={{ width: `${progress}%` }} /></View>
    <Text className='startup-percent'>{progress}%</Text>
  </View>
}
