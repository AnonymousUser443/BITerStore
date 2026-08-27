import { Text } from '@tarojs/components'

export type GlyphName = 'home' | 'search' | 'publish' | 'message' | 'user' | 'bell' | 'back' | 'heart' | 'filter' | 'camera' | 'book' | 'shield' | 'chevron' | 'sparkle' | 'refresh' | 'image' | 'send' | 'check' | 'warning' | 'leaf' | 'more' | 'settings' | 'trade' | 'bookmark'

const glyphs: Record<GlyphName, string> = {
  home: '⌂', search: '⌕', publish: '➤', message: '◌', user: '♙', bell: '♧', back: '‹',
  heart: '♡', filter: '≛', camera: '▣', book: '▥', shield: '◈', chevron: '›', sparkle: '✦',
  refresh: '↻', image: '▧', send: '➤', check: '✓', warning: '!', leaf: '❧', more: '•••', settings: '⚙', trade: '▣', bookmark: '♡'
}

export function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  return <Text className={`glyph glyph-${name} ${className}`}>{glyphs[name]}</Text>
}
