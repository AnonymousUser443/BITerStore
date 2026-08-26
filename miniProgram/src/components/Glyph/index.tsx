import { Text } from '@tarojs/components'

export type GlyphName = 'home' | 'search' | 'publish' | 'message' | 'user' | 'bell' | 'back' | 'more' | 'heart' | 'filter' | 'camera' | 'book' | 'pin' | 'shield' | 'chevron' | 'close' | 'sparkle' | 'refresh' | 'image' | 'send' | 'settings' | 'check' | 'warning'

const glyphs: Record<GlyphName, string> = {
  home: '⌂', search: '⌕', publish: '➤', message: '◌', user: '♙', bell: '♧', back: '‹', more: '•••',
  heart: '♡', filter: '≛', camera: '▣', book: '▥', pin: '⌖', shield: '◈', chevron: '›', close: '×',
  sparkle: '✦', refresh: '↻', image: '▧', send: '➤', settings: '⚙', check: '✓', warning: '!',
}

export function Glyph({ name, className = '' }: { name: GlyphName; className?: string }) {
  return <Text className={`glyph glyph-${name} ${className}`}>{glyphs[name]}</Text>
}
