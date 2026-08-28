const json = (body, status, ttl) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': `public, max-age=${ttl}`,
    'x-content-type-options': 'nosniff',
  },
})

function validIsbn(isbn) {
  if (!/^\d{13}$/.test(isbn)) return false
  const sum = [...isbn.slice(0, 12)].reduce((total, value, index) => total + Number(value) * (index % 2 ? 3 : 1), 0)
  return (10 - sum % 10) % 10 === Number(isbn[12])
}

function openLibraryBook(isbn, value) {
  if (!value?.title) return null
  return {
    isbn,
    title: value.title,
    author: (value.authors || []).map((item) => item.name).filter(Boolean).join(' / '),
    publisher: (value.publishers || []).map((item) => item.name).filter(Boolean).join(' / '),
    publishDate: value.publish_date || '',
    coverUrl: value.cover?.large || value.cover?.medium || value.cover?.small || '',
    subjects: (value.subjects || []).map((item) => item.name).filter(Boolean).slice(0, 5),
  }
}

function googleBook(isbn, value) {
  const book = value?.items?.[0]?.volumeInfo
  if (!book?.title) return null
  return {
    isbn,
    title: book.title,
    author: (book.authors || []).join(' / '),
    publisher: book.publisher || '',
    publishDate: book.publishedDate || '',
    coverUrl: book.imageLinks?.extraLarge || book.imageLinks?.large || book.imageLinks?.thumbnail || '',
    subjects: (book.categories || []).slice(0, 5),
  }
}

async function fetchBook(isbn, env) {
  const key = `ISBN:${isbn}`
  const openLibrary = await fetch(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`, {
    headers: { 'user-agent': env.UPSTREAM_USER_AGENT || 'BITerStore/1.0 (book metadata proxy)' },
  })
  if (openLibrary.ok) {
    const found = openLibraryBook(isbn, (await openLibrary.json())[key])
    if (found) return found
  }
  if (!env.GOOGLE_BOOKS_API_KEY) return null
  const google = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1&key=${encodeURIComponent(env.GOOGLE_BOOKS_API_KEY)}`)
  return google.ok ? googleBook(isbn, await google.json()) : null
}

export default {
  async fetch(request, env, context) {
    if (request.method !== 'GET') return json({ message: 'Method not allowed' }, 405, 0)
    if (env.PROXY_TOKEN && request.headers.get('authorization') !== `Bearer ${env.PROXY_TOKEN}`) return json({ message: 'Unauthorized' }, 401, 0)
    const match = new URL(request.url).pathname.match(/^\/isbn\/(\d{13})$/)
    if (!match || !validIsbn(match[1])) return json({ message: 'Invalid ISBN' }, 400, 0)

    const cache = caches.default
    const cacheKey = new Request(`https://book-metadata-cache.invalid/isbn/${match[1]}`)
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    try {
      const value = await fetchBook(match[1], env)
      const response = value ? json(value, 200, 2592000) : json({ message: 'Book not found' }, 404, 86400)
      context.waitUntil(cache.put(cacheKey, response.clone()))
      return response
    } catch {
      return json({ message: 'Upstream unavailable' }, 502, 0)
    }
  },
}
