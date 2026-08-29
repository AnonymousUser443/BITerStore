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

function openLibrarySearchBook(isbn, value) {
  const book = value?.docs?.[0]
  if (!book?.title) return null
  return {
    isbn,
    title: book.title,
    author: (book.author_name || []).join(' / '),
    publisher: (book.publisher || []).slice(0, 3).join(' / '),
    publishDate: book.first_publish_year ? String(book.first_publish_year) : '',
    coverUrl: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : '',
    subjects: (book.subject || []).slice(0, 5),
  }
}

function crossrefBook(isbn, value) {
  const book = (value?.message?.items || []).find((item) => (item.ISBN || []).map((candidate) => String(candidate).replace(/[^0-9Xx]/g, '')).includes(isbn))
  const title = book?.title?.[0]
  if (!title) return null
  const dateParts = book.published?.['date-parts']?.[0] || []
  return {
    isbn,
    title,
    author: (book.author || []).map((author) => [author.given, author.family].filter(Boolean).join(' ')).filter(Boolean).join(' / '),
    publisher: book.publisher || '',
    publishDate: dateParts.join('-'),
    coverUrl: '',
    subjects: (book.subject || []).slice(0, 5),
  }
}

async function fetchJson(url, headers) {
  try {
    const response = await fetch(url, { headers })
    return response.ok ? response.json() : null
  } catch {
    return null
  }
}

async function fetchBook(isbn, env) {
  if (env.GOOGLE_BOOKS_API_KEY) {
    const google = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=3&key=${encodeURIComponent(env.GOOGLE_BOOKS_API_KEY)}`)
    const found = googleBook(isbn, google)
    if (found) return found
  }

  const key = `ISBN:${isbn}`
  const headers = { 'user-agent': env.UPSTREAM_USER_AGENT || 'BITerStore/1.0 (book metadata proxy)' }
  const openLibrary = await fetchJson(`https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`, headers)
  const direct = openLibraryBook(isbn, openLibrary?.[key])
  if (direct) return direct

  const search = await fetchJson(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&fields=title,author_name,publisher,first_publish_year,cover_i,subject&limit=1`, headers)
  const searched = openLibrarySearchBook(isbn, search)
  if (searched) return searched

  const crossref = await fetchJson(`https://api.crossref.org/works?filter=isbn:${encodeURIComponent(isbn)}&rows=3&select=title,author,publisher,published,ISBN,subject`, headers)
  return crossrefBook(isbn, crossref)
}

export default {
  async fetch(request, env, context) {
    if (request.method !== 'GET') return json({ message: 'Method not allowed' }, 405, 0)
    if (env.PROXY_TOKEN && request.headers.get('authorization') !== `Bearer ${env.PROXY_TOKEN}`) return json({ message: 'Unauthorized' }, 401, 0)
    const match = new URL(request.url).pathname.match(/^\/isbn\/(\d{13})$/)
    if (!match || !validIsbn(match[1])) return json({ message: 'Invalid ISBN' }, 400, 0)

    const cache = caches.default
    const cacheKey = new Request(`https://book-metadata-cache.invalid/v2/isbn/${match[1]}`)
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
