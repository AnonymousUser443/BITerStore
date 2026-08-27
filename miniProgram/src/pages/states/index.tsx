import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import { AppShell, Brand } from '@/components/ui'
import { Glyph } from '@/components/Glyph'
import { navigationAdapter } from '@/platform'

const states = {
  loading: ['正在准备页面', '托比正在把书页整理好，请稍等一下。', 'search', '返回首页'],
  searching: ['正在搜索好书', '书架有点大，托比马上把结果带回来。', 'search', '返回分类'],
  empty: ['这里还没有内容', '第一本书，也许就在等你来发布。', 'question', '发布一本书'],
  'no-results': ['没有找到相关书籍', '试试更短的关键词，或放宽校区和成色筛选。', 'question', '重新搜索'],
  network: ['网络好像走丢了', '别担心，已填写的内容仍保存在本机。', 'sad', '重新加载'],
  maintenance: ['托比正在维护书架', '系统很快回来，稍后再来看看吧。', 'maintenance', '返回首页'],
  unavailable: ['这本书目前不可用', '它可能已经售出或暂时下架，再看看其他好书吧。', 'unavailable', '发现其他书'],
  published: ['发布成功！', '你的闲置已经上架，等待下一位同学发现它。', 'cheer', '查看我的发布'],
  success: ['发布成功！', '你的闲置已经上架，等待下一位同学发现它。', 'cheer', '查看我的发布'],
  'not-found': ['好像翻错书页了', '这个页面不存在，托比带你回到熟悉的地方。', 'sad', '返回首页']
} as const

export default function StatesPage() {
  const type = Taro.getCurrentInstance().router?.params.type || 'index'
  if (type === 'index') return <AppShell title='演示与状态' back className='states-index'><View className='state-grid'>{Object.entries(states).filter(([key]) => !['not-found', 'success'].includes(key)).map(([key, value]) => <Button id={`e2e-state-open-${key}`} key={key} onClick={() => navigationAdapter.go(`/pages/states/index?type=${key}`)}><Image src={`/assets/tobby-${value[2]}.webp`} mode='aspectFit' /><Text className='state-card-title'>{value[0]}</Text><Glyph name='chevron' /></Button>)}</View></AppShell>
  const current = states[type as keyof typeof states] || states['not-found']
  const destination = ['published', 'success'].includes(type) ? '/pages/my-listings/index' : type === 'empty' ? '/pages/publish/index' : ['searching', 'no-results', 'unavailable'].includes(type) ? '/pages/search/index' : '/pages/home/index'
  const go = () => destination.includes('/search/') || destination.includes('/publish/') || destination.includes('/home/') ? navigationAdapter.switchTab(destination) : navigationAdapter.go(destination)
  return <View id={`e2e-state-${type}`} className='phone-shell full-state'><Image className='paper-texture' src='/assets/paper-bg.webp' mode='aspectFill' /><Brand /><View className='state-orbit' /><Image className='state-image' src={`/assets/tobby-${current[2]}.webp`} mode='aspectFit' /><Text className='state-title'>{current[0]}</Text><Text className='state-copy'>{current[1]}</Text>{['loading', 'searching'].includes(type) && <View className='loading-bar'><Text /></View>}<Button className='primary-button' onClick={go}>{current[3]}</Button><Text className='state-footnote'>BITerStore · 让每一本书继续被需要</Text></View>
}
