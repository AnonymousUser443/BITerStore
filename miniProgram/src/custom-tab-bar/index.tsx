import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'

import { navItems } from '../components/BottomNav'
import { Glyph } from '../components/Glyph'

export default function CustomTabBar() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const route = Taro.getCurrentPages().at(-1)?.route
    const index = navItems.findIndex((item) => item.route.slice(1) === route)
    if (index >= 0) setActive(index)
  }, [])

  return (
    <View className='weapp-tab-shell'>
      <View className='bottom-nav weapp-bottom-nav'>
        {navItems.map((item, index) => (
          <View
            id={`e2e-nav-${item.key}`}
            className={`nav-item ${active === index ? 'active' : ''} ${item.primary ? 'publish' : ''}`}
            onClick={() => Taro.switchTab({ url: item.route })}
            key={item.key}
          >
            <Glyph name={item.glyph} /><View>{item.label}</View>
          </View>
        ))}
      </View>
    </View>
  )
}
