import { parentPort, workerData } from 'node:worker_threads'
import { inspectImage } from '../../common/image-validation.js'

const input = workerData as { bytes: Uint8Array; declaredMime: string }

try {
  parentPort?.postMessage({ metadata: inspectImage(Buffer.from(input.bytes), input.declaredMime) })
} catch (cause) {
  parentPort?.postMessage({ error: cause instanceof Error ? cause.message : '图片校验失败' })
}
