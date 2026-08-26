import { Button, Slider, Text, View } from '@tarojs/components'

import { campuses, categories, conditions, defaultFilters } from '../../domain/constants'
import type { BookFilters } from '../../domain/types'
import { Glyph } from '../Glyph'

function FilterGroup({ label, options, value, onSelect }: { label: string; options: readonly string[]; value: string; onSelect: (value: string) => void }) {
  return <View className='filter-group'><Text>{label}</Text><View>{options.map((option) => <Button className={option === value ? 'active' : ''} onClick={() => onSelect(option)} key={option}>{option}</Button>)}</View></View>
}

export function FilterDrawer({ filters, count, onChange, onClose }: { filters: BookFilters; count: number; onChange: (next: BookFilters) => void; onClose: () => void }) {
  return (
    <View className='sheet-layer'>
      <View className='sheet-scrim' onClick={onClose} />
      <View className='filter-sheet'>
        <View className='sheet-handle' />
        <View className='sheet-title'><View>高级筛选 <Text>❧</Text></View><Button onClick={() => onChange({ ...defaultFilters })}>清空</Button><Button onClick={onClose}><Glyph name='close' /></Button></View>
        <View className='range-label'><View><Text>价格区间（元）</Text><Text>¥0 — ¥{filters.maxPrice}+</Text></View><Slider min={20} max={200} step={10} value={filters.maxPrice} activeColor='#6F7956' blockColor='#FFFDF8' onChange={(event) => onChange({ ...filters, maxPrice: event.detail.value })} /></View>
        <FilterGroup label='校区' options={campuses} value={filters.campus} onSelect={(campus) => onChange({ ...filters, campus: campus as BookFilters['campus'] })} />
        <FilterGroup label='分类' options={categories} value={filters.category} onSelect={(category) => onChange({ ...filters, category })} />
        <FilterGroup label='成色' options={conditions} value={filters.condition} onSelect={(condition) => onChange({ ...filters, condition: condition as BookFilters['condition'] })} />
        <View className='switch-row' onClick={() => onChange({ ...filters, availableOnly: !filters.availableOnly })}><Text>只看可交易</Text><View className={filters.availableOnly ? 'switch active' : 'switch'}><View /></View></View>
        <Button className='primary-button apply-filter' onClick={onClose}>查看 {count} 个结果</Button>
      </View>
    </View>
  )
}
