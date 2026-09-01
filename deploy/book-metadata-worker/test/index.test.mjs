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

test('accepts ISBN-10 and matches an upstream ISBN-13 edition', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 0,
    success: true,
    data: { isbn: '9787115428028', bookName: '精确匹配教材' },
  }), { status: 200 })
  const response = await worker.fetch(
    new Request('https://worker.test/isbn/7115428026'),
    { ISBN_WORK_APP_KEY: 'isbn-work-secret' },
    { waitUntil() {} },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    isbn: '7115428026',
    title: '精确匹配教材',
    author: '',
    publisher: '',
    publishDate: '',
    coverUrl: '',
    subjects: [],
  })
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

test('prefers an exact isbn.work result when its app key is configured', async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /^https:\/\/data\.isbn\.work\/openApi\/getInfoByIsbn\?/)
    return new Response(JSON.stringify({
      code: 0,
      success: true,
      data: {
        isbn: '9787513915670',
        bookName: '四世同堂（上下册）  ',
        author: '老舍',
        press: '民主与建设出版社',
        pressDate: [2017, 6],
        pictures: '["https://images.example.test/cover.jpg"]',
        clcName: '中国文学',
        clcCode: 'I246.5',
      },
    }), { status: 200 })
  }
  const response = await worker.fetch(
    new Request('https://worker.test/isbn/9787513915670'),
    { ISBN_WORK_APP_KEY: 'isbn-work-secret' },
    { waitUntil() {} },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    isbn: '9787513915670',
    title: '四世同堂（上下册）',
    author: '老舍',
    publisher: '民主与建设出版社',
    publishDate: '2017-6',
    coverUrl: 'https://images.example.test/cover.jpg',
    subjects: ['中国文学', 'I246.5'],
  })
})

test('ignores an isbn.work response for a different ISBN and falls back', async () => {
  let call = 0
  globalThis.fetch = async () => {
    call += 1
    if (call === 1) {
      return new Response(JSON.stringify({ code: 0, success: true, data: { isbn: '9787513915670', bookName: '错误书名' } }), { status: 200 })
    }
    return new Response(JSON.stringify({
      'ISBN:9787115428028': { title: '精确匹配教材', authors: [{ name: '作者' }] },
    }), { status: 200 })
  }
  const response = await worker.fetch(
    new Request('https://worker.test/isbn/9787115428028'),
    { ISBN_WORK_APP_KEY: 'isbn-work-secret' },
    { waitUntil() {} },
  )
  assert.equal(response.status, 200)
  assert.equal((await response.json()).title, '精确匹配教材')
  assert.equal(call, 2)
})

test('selects the exact Google Books ISBN instead of the first fuzzy result', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [
    { volumeInfo: { title: '错误书名', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9787513915670' }] } },
    { volumeInfo: { title: '精确书名', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9787115428028' }] } },
  ] }), { status: 200 })
  const response = await worker.fetch(
    new Request('https://worker.test/isbn/9787115428028'),
    { GOOGLE_BOOKS_API_KEY: 'google-secret' },
    { waitUntil() {} },
  )
  assert.equal(response.status, 200)
  assert.equal((await response.json()).title, '精确书名')
})

test('falls back to the Open Library search index when direct lookup misses', async () => {
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    if (String(url).includes('/api/books')) return new Response('{}', { status: 200 })
    return new Response(JSON.stringify({ docs: [{ title: '真实教材', isbn: ['9787115428028'], author_name: ['真实作者'], publisher: ['真实出版社'], first_publish_year: 2024, subject: ['教材'] }] }), { status: 200 })
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

test('selects the exact Open Library search ISBN instead of the first fuzzy result', async () => {
  let call = 0
  globalThis.fetch = async () => {
    call += 1
    if (call === 1) return new Response('{}', { status: 200 })
    return new Response(JSON.stringify({ docs: [
      { title: '错误书名', isbn: ['9787513915670'] },
      { title: '精确书名', isbn: ['9787115428028'] },
    ] }), { status: 200 })
  }
  const response = await worker.fetch(new Request('https://worker.test/isbn/9787115428028'), {}, { waitUntil() {} })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).title, '精确书名')
  assert.equal(call, 2)
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
