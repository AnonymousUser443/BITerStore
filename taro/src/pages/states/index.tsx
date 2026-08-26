import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { AppShell, Tobby } from '@/components/ui'
import { navigationAdapter } from '@/platform'

const states = {
  loading: ['正在翻找书架', '资源马上准备好', 'hello'], searching: ['正在搜索', 'Tobby 正在匹配课程与书名', 'search'],
  empty: ['这里还没有书', '成为第一个发布的人吧', 'question'], 'no-results': ['没有找到结果', '换一个关键词或减少筛选条件', 'sad'],
  network: ['网络走神了', '稍后重试，当前演示数据仍在设备上', 'sad'], maintenance: ['书架整理中', '我们正在进行短暂维护', 'maintenance'],
  unavailable: ['这本书暂不可用', '可能已售出或被卖家下架', 'sad'], success: ['发布成功', '你的闲置书已经出现在书架上', 'cheer'],
  'not-found': ['页面没找到', '这条路可能已经换了方向', 'question']
} as const
export default function StatesPage() { const type = Taro.getCurrentInstance().router?.params.type || 'index'; if (type === 'index') return <AppShell title='状态体验' back><View className='menu-grid'>{Object.entries(states).map(([key, value]) => <Button id={`e2e-state-open-${key}`} key={key} className='menu-row' onClick={() => navigationAdapter.go(`/pages/states/index?type=${key}`)}><Text className='grow'>{value[0]}</Text><Text>›</Text></Button>)}</View></AppShell>; const current = states[type as keyof typeof states] || states['not-found']; return <AppShell title='状态提示' back><View id={`e2e-state-${type}`} className='state-page'><Tobby mood={current[2]} /><Text className='section-title'>{current[0]}</Text><Text className='muted'>{current[1]}</Text><Button className='primary-button' onClick={() => navigationAdapter.switchTab('/pages/home/index')}>回到首页</Button></View></AppShell> }
