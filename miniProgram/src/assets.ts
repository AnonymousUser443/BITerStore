const bundledAssetExtension = process.env.TARO_ENV === 'weapp' ? 'png' : 'webp'

/**
 * Resolve artwork that ships inside the client bundle.
 *
 * WeChat's native Image component only enables WebP decoding for network
 * resources. Keep the compact WebP originals for H5, but use the generated
 * PNG compatibility set on real mini-program devices.
 */
export function bundledAsset(name: string): string {
  return `/assets/${name}.${bundledAssetExtension}`
}

export function isNetworkWebp(source?: string): boolean {
  return Boolean(source && /^https:\/\//i.test(source) && /\.webp(?:[?#]|$)/i.test(source))
}
