import { useEffect, useState } from 'react'
import { Image } from '@tarojs/components'
import { isNetworkWebp } from '@/assets'
import { isPrivateMedia, resolveMediaSource } from '@/domain/api'
import { privateMediaAdapter } from '@/platform'

export function ListingImage({ src, className, mode = 'aspectFill' }: { src: string; className?: string; mode?: 'aspectFit' | 'aspectFill' }) {
  const privateSource = process.env.TARO_ENV !== 'h5' && isPrivateMedia(src)
  const [resolved, setResolved] = useState<{ source: string; path: string }>()
  useEffect(() => {
    if (!privateSource) return
    let active = true
    let temporaryPath: string | undefined
    void resolveMediaSource(src).then((path) => {
      if (!active) { void privateMediaAdapter.release(path); return }
      temporaryPath = path
      setResolved({ source: src, path })
    }).catch(() => undefined)
    return () => { active = false; if (temporaryPath) void privateMediaAdapter.release(temporaryPath) }
  }, [src, privateSource])
  const source = privateSource ? resolved?.source === src ? resolved.path : '' : src
  return <Image className={className} src={source} webp={isNetworkWebp(src)} mode={mode} />
}
