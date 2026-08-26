import Taro from '@tarojs/taro'

export interface MediaAdapter {
  chooseImages(limit?: number): Promise<string[]>
  persistImages(paths: string[]): Promise<string[]>
}

export const mediaAdapter: MediaAdapter = {
  async chooseImages(limit = 6) {
    const result = await Taro.chooseMedia({
      count: limit,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
    })
    return result.tempFiles.map((file) => file.tempFilePath)
  },
  async persistImages(paths) {
    if (process.env.TARO_ENV === 'h5') return paths
    const persisted = await Promise.all(paths.map(async (filePath) => {
      try {
        const saved = await Taro.saveFile({ tempFilePath: filePath })
        return 'savedFilePath' in saved ? saved.savedFilePath : filePath
      } catch {
        return filePath
      }
    }))
    return persisted
  },
}
