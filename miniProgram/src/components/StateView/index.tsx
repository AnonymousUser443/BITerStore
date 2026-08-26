import { Button, Image, Text, View } from '@tarojs/components'

import { assets } from '../../assets'
import { navigationAdapter, routes } from '../../platform/navigation'
import { Brand } from '../BrandHeader'

export type StateType = 'loading' | 'searching' | 'empty' | 'no-results' | 'network' | 'maintenance' | 'unavailable' | 'published' | '404'

export const stateContent: Record<StateType, { title: string; text: string; image: string; button: string; target: string }> = {
  loading: { title: '正在准备页面', text: '托比正在把书页整理好，请稍等一下。', image: assets.tobbySearch, button: '返回首页', target: routes.home },
  searching: { title: '正在搜索好书', text: '书架有点大，托比马上把结果带回来。', image: assets.tobbySearch, button: '返回搜索', target: routes.search },
  empty: { title: '这里还没有内容', text: '第一本书，也许就在等你来发布。', image: assets.tobbyQuestion, button: '发布一本书', target: routes.publish },
  'no-results': { title: '没有找到相关书籍', text: '试试更短的关键词，或放宽校区和成色筛选。', image: assets.tobbyQuestion, button: '重新搜索', target: routes.search },
  network: { title: '网络好像走丢了', text: '别担心，已填写的内容仍保存在本机。', image: assets.tobbySad, button: '重新加载', target: routes.home },
  maintenance: { title: '托比正在维护书架', text: '系统很快回来，稍后再来看看吧。', image: assets.tobbyMaintenance, button: '返回首页', target: routes.home },
  unavailable: { title: '这本书目前不可用', text: '它可能已经售出或暂时下架，再看看其他好书吧。', image: assets.tobbyUnavailable, button: '发现其他书', target: routes.search },
  published: { title: '发布成功！', text: '你的闲置已经上架，等待下一位同学发现它。', image: assets.tobbyCheer, button: '查看我的发布', target: routes.myListings },
  '404': { title: '好像翻错书页了', text: '这个页面不存在，托比带你回到熟悉的地方。', image: assets.tobbySad, button: '返回首页', target: routes.home },
}

export function InlineLoading({ label = '托比正在翻找书架…' }: { label?: string }) {
  return <View className='inline-state'><Image src={assets.tobbySearch} mode='aspectFit' /><View>{label}</View><View className='loading-bar'><View /></View></View>
}

export function InlineEmpty({ onAction }: { onAction?: () => void }) {
  return <View className='inline-state large'><Image src={assets.tobbyQuestion} mode='aspectFit' /><View>这次没有找到合适的书</View><Text>换个关键词，或者发布一条求书心愿吧。</Text><Button className='secondary-button' onClick={onAction ?? (() => navigationAdapter.to(routes.states, { type: 'no-results' }))}>查看空状态</Button></View>
}

export function FullState({ type }: { type: StateType }) {
  const content = stateContent[type]
  return <View className='phone-shell full-state'><View className='paper-texture' /><Brand /><View className='state-orbit' /><Image src={content.image} mode='aspectFit' /><View className='state-title'>{content.title}</View><Text>{content.text}</Text>{['loading', 'searching'].includes(type) && <View className='loading-bar'><View /></View>}<Button className='primary-button' onClick={() => navigationAdapter.replace(content.target)}>{content.button}</Button><Text className='state-foot'>BITerStore · 让每一本书继续被需要</Text></View>
}
