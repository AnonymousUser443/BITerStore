import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parentPort, workerData } from 'node:worker_threads'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { ImageValidationError, inspectImage } from '../../common/image-validation.js'

async function run() {
  const input = workerData as { bytes: ArrayBuffer; declaredMime: string }
  const imageBytes = new Uint8Array(input.bytes)
  try {
    inspectImage(Buffer.from(imageBytes), input.declaredMime)
  } catch (cause) {
    if (cause instanceof ImageValidationError) {
      parentPort?.postMessage({ validationError: cause.message })
      return
    }
    throw cause
  }
  const bytes = await readFile(fileURLToPath(import.meta.resolve('zxing-wasm/reader/zxing_reader.wasm')))
  const wasmBinary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  await prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true })
  const results = await readBarcodes(imageBytes, {
    formats: ['EAN13'],
    tryHarder: true,
    tryRotate: true,
    maxNumberOfSymbols: 4
  })
  parentPort?.postMessage({ texts: results.map((result) => result.text) })
}

void run().catch((cause) => {
  parentPort?.postMessage({ error: cause instanceof Error ? cause.message : 'barcode worker failed' })
})
