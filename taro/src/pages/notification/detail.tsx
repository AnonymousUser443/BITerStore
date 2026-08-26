import Taro from '@tarojs/taro'
import { Text, View } from '@tarojs/components'
import { AppShell, Tobby } from '@/components/ui'

const copy = { like: ['收到的赞', '同学们喜欢你分享的书'], comment: ['新的留言', '及时回复会让交易更顺畅'], system: ['系统通知', '请优先选择校内公共区域交易'], follow: ['新的关注', '书友会看到你之后的发布'] }
export default function NotificationDetailPage() { const type = (Taro.getCurrentInstance().router?.params.type || 'system') as keyof typeof copy; return <AppShell title={copy[type][0]} back><View id={`e2e-notification-detail-${type}`} className='paper-card profile-hero'><Tobby mood={type === 'system' ? 'question' : 'heart'} /><Text className='section-title'>{copy[type][0]}</Text><Text className='muted'>{copy[type][1]}</Text></View><View className='section-row'><Text className='section-title'>最近动态</Text></View><View className='notice-row'><Text>今天</Text><Text className='grow'>这是一条可复现的本地演示通知。</Text></View><View className='notice-row'><Text>昨天</Text><Text className='grow'>所有通知均保存在当前设备中。</Text></View></AppShell> }
