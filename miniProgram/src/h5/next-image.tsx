import type { ImgHTMLAttributes } from 'react'

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  priority?: boolean
  unoptimized?: boolean
}

export default function NextImage({ priority, unoptimized: _unoptimized, loading, decoding, fetchPriority, ...props }: NextImageProps) {
  return (
    <img
      {...props}
      loading={priority ? 'eager' : loading ?? 'lazy'}
      decoding={decoding ?? 'async'}
      fetchPriority={priority ? 'high' : fetchPriority}
    />
  )
}
