import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import worker from '../src/index.js'

const originalFetch = globalThis.fetch
const originalCaches = globalThis.caches
let cachePut

beforeEach(() => {
  cachePut = Promise.resolve()
  globalThis.caches = { default: { match: async () => undefined, put: async () => cachePut } }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  globalThis.caches = originalCaches
})

test('rejects requests without the configured shared token', async () => {
  const response = await worker.fetch(new Request('https://worker.test/isbn/9787115428028'), { PROXY_TOKEN: 'secret' }, { waitUntil() {} })
  assert.equal(response.status, 401)
})

test('rejects invalid ISBN checksums before contacting an upstream', async () => {
  let requested = false
  globalThis.fetch = async () => { requested = true; return new Response() }
  const response = await worker.fetch(new Request('https://worker.test/isbn/9787115428029'), {}, { waitUntil() {} })
  assert.equal(response.status, 400)
  assert.equal(requested, false)
})

test('normalizes and caches an Open Library result', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    'ISBN:9787115428028': { title: '测试教材', authors: [{ name: '作者' }], publishers: [{ name: '出版社' }], subjects: [{ name: '教材' }] }
  }), { status: 200 })
  let scheduled
  const response = await worker.fetch(
    new Request('https://worker.test/isbn/9787115428028', { headers: { Authorization: 'Bearer secret' } }),
    { PROXY_TOKEN: 'secret' },
    { waitUntil(value) { scheduled = value } },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { isbn: '9787115428028', title: '测试教材', author: '作者', publisher: '出版社', publishDate: '', coverUrl: '', subjects: ['教材'] })
  await scheduled
})
