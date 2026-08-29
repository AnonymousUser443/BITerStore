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

test('falls back to the Open Library search index when direct lookup misses', async () => {
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    if (String(url).includes('/api/books')) return new Response('{}', { status: 200 })
    return new Response(JSON.stringify({ docs: [{ title: '真实教材', author_name: ['真实作者'], publisher: ['真实出版社'], first_publish_year: 2024, subject: ['教材'] }] }), { status: 200 })
  }
  const response = await worker.fetch(
    new Request('https://worker.test/isbn/9787115428028', { headers: { Authorization: 'Bearer secret' } }),
    { PROXY_TOKEN: 'secret' },
    { waitUntil() {} },
  )
  assert.equal(response.status, 200)
  assert.equal((await response.json()).title, '真实教材')
  assert.equal(requested.length, 2)
  assert.match(requested[1], /search\.json\?isbn=9787115428028/)
})

test('uses an exact Crossref ISBN match after Open Library misses', async () => {
  let call = 0
  globalThis.fetch = async () => {
    call += 1
    if (call === 1) return new Response('{}', { status: 200 })
    if (call === 2) return new Response('{"docs":[]}', { status: 200 })
    return new Response(JSON.stringify({ message: { items: [{ ISBN: ['9787115428028'], title: ['交叉索引教材'], author: [{ given: '测试', family: '作者' }], publisher: '出版社', published: { 'date-parts': [[2025, 8]] }, subject: ['教材'] }] } }), { status: 200 })
  }
  const response = await worker.fetch(new Request('https://worker.test/isbn/9787115428028'), {}, { waitUntil() {} })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { isbn: '9787115428028', title: '交叉索引教材', author: '测试 作者', publisher: '出版社', publishDate: '2025-8', coverUrl: '', subjects: ['教材'] })
})
