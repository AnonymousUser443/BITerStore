import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { AppShell } from '@/components/ui'
import { Glyph, type GlyphName } from '@/components/Glyph'
import type { Notification } from '@/domain/types'
import { seedNotifications } from '@/domain/seed'
import { navigationAdapter } from '@/platform'

const details: Record<Notification['type'], Array<[string, string, string, string]>> = {
  like: [['林小暖', '赞了你发布的《高等数学（第七版）上册》。', '10:18', '/pages/listing/detail?id=math-7'], ['简一一', '赞了你的校园书单「期末复习好书」。', '昨天 18:42', '/pages/favorites/index'], ['Oliver_周', '赞了你分享的旧书循环动态。', '周五 20:06', '/pages/profile/index']],
  comment: [['Oliver_周', '评论：书的笔记多吗？方便拍一下目录页吗？', '10:05', '/pages/listing/detail?id=data-c'], ['林小暖', '评论：这本高数正好是我需要的版本～', '昨天 21:30', '/pages/listing/detail?id=math-7'], ['Leo 学长', '评论：中关村校区也可以约时间自取。', '昨天 16:12', '/pages/chat/index?id=thread-leo'], ['简一一', '评论：谢谢你的书单推荐！', '周四 19:45', '/pages/chat/index?id=thread-jian'], ['Tobby', '你的发布收到了新的留言，记得及时回复。', '周三 12:08', '/pages/messages/index']],
  system: [['校园交易安全提醒', '请尽量选择校内公共区域当面交易，确认书况后再付款。', '今天 09:00', '/pages/states/index?type=index'], ['BITerStore 试运行公告', '演示数据与状态体验入口已经更新完成。', '昨天 12:00', '/pages/profile/index']],
  follow: [['简一一', '关注了你，之后发布的新书会更容易被她发现。', '昨天 15:26', '/pages/chat/index?id=thread-jian']]
}
const glyphs: Record<Notification['type'], GlyphName> = { like: 'heart', comment: 'message', system: 'bell', follow: 'user' }

export default function NotificationDetailPage() {
  const raw = Taro.getCurrentInstance().router?.params.type || 'system'
  const type = (['like', 'comment', 'system', 'follow'].includes(raw) ? raw : 'system') as Notification['type']
  const summary = seedNotifications.find((item) => item.type === type) || seedNotifications[2]
  return <AppShell title={summary.title} back active='messages' className='notification-detail-page'><View className={`notification-detail-hero ${type}`}><View className={`notice-icon ${type}`}><Glyph name={glyphs[type]} /></View><View><Text className='notification-kicker'>消息分类</Text><Text className='notification-title'>{summary.title}</Text><Text className='notification-subtitle'>{summary.subtitle}</Text></View><Text className='notification-unread'>{summary.unread} 条未读</Text></View><View className='notification-feed'>{details[type].map(([source, text, time, route], index) => <Button key={`${source}-${time}`} onClick={() => navigationAdapter.go(route)}><Text className='feed-index'>{String(index + 1).padStart(2, '0')}</Text><View><Text className='feed-source'>{source}</Text><Text className='feed-copy'>{text}</Text><Text className='feed-time'>{time}</Text></View><Glyph name='chevron' /></Button>)}</View><View className='notification-safe'>◈ 通知内容为本地演示数据，不会向校外账号发送。</View></AppShell>
}
