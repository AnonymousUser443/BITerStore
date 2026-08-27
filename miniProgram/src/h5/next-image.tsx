import type { ImgHTMLAttributes } from 'react'

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean
  unoptimized?: boolean
}

export default function NextImage({ priority: _priority, unoptimized: _unoptimized, ...props }: NextImageProps) {
  return <img {...props} />
}
