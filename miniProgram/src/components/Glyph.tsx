import { Text } from '@tarojs/components'

export type GlyphName = 'home' | 'search' | 'publish' | 'message' | 'user' | 'bell' | 'back' | 'heart' | 'filter' | 'camera' | 'book' | 'shield' | 'chevron' | 'sparkle' | 'refresh' | 'image' | 'send' | 'check' | 'warning'

const glyphs: Record<GlyphName, string> = {
  home: '⌂', search: '⌕', publish: '➤', message: '◌', user: '♙', bell: '♧', back: '‹',
  heart: '♡', filter: '≛', camera: '▣', book: '▥', shield: '◈', chevron: '›', sparkle: '✦',
  refresh: '↻', image: '▧', send: '➤', check: '✓', warning: '!'
}

export function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  return <Text className={`glyph glyph-${name} ${className}`}>{glyphs[name]}</Text>
}
