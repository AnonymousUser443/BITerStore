import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function checkAdminReview(client, artifactDir) {
  const dist = fileURLToPath(new URL('../../admin/dist/', import.meta.url))
  const image = await fs.readFile(new URL('../src/assets/tobby-hello.webp', import.meta.url))
  const listing = { id: 'pending-review-book', version: 4, title: '审核中的高等数学', author: '教材作者', isbn: '9787040396638', category: '教材教辅', course: '高等数学', condition: '九成新', description: '这是待审核商品的完整描述。\n保留换行并可查看 ISBN 凭证。', priceCents: 2000, originalPriceCents: 4000, campus: '良乡', tags: ['数学'], status: 'PENDING_REVIEW', createdAt: '2026-09-18T00:00:00Z', updatedAt: '2026-09-18T00:00:00Z', seller: { id: 'seller', nickname: '审核测试卖家', status: 'ACTIVE' }, images: [{ id: 'cover', role: 'COVER', sortOrder: 0, moderationStatus: 'PENDING' }, { id: 'isbn', role: 'ISBN', sortOrder: 1, moderationStatus: 'PENDING' }], _count: { favorites: 0, conversations: 0 } }
  const requests = []
  const server = createServer(async (request, response) => {
    try {
      const route = new URL(request.url, 'http://localhost').pathname
      if (route.startsWith('/api/')) {
        requests.push(route)
        if (route.startsWith('/api/v1/media/review/')) { response.writeHead(200, { 'Content-Type': 'image/webp' }).end(image); return }
        const body = route === '/api/v1/admin/security/status' ? { user: { id: 'qa-admin', nickname: '验收管理员', role: 'ADMIN' }, totpEnabled: true }
          : route === '/api/v1/admin/metrics' ? { users: 1, activeUsers: 1, newUsers: 1, listings: 1, activeListings: 0, newListings: 1, sold: 0, openReports: 0 }
          : route === '/api/v1/admin/listings' ? { items: [listing], page: 1, pages: 1, pageSize: 20, total: 1 }
          : route === '/api/v1/admin/listings/pending-review-book' ? listing : null
        response.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(body || { message: 'Not found' })); return
      }
      const relative = route.replace(/^\/admin\/?/, '') || 'index.html'
      const file = path.resolve(dist, relative)
      if (!file.startsWith(dist)) { response.writeHead(403).end(); return }
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
      response.writeHead(200, { 'Content-Type': type }).end(await fs.readFile(file))
    } catch { response.writeHead(404).end() }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const injected = await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `if (location.origin === ${JSON.stringify(origin)}) sessionStorage.setItem('biterstore-admin-token', 'synthetic-admin-test-token')` })
  const evaluate = async (expression) => (await client.send('Runtime.evaluate', { expression, returnByValue: true })).result.value
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  try {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    const loaded = client.once('Page.loadEventFired')
    await client.send('Page.navigate', { url: origin + '/admin/' }); await loaded; await pause(500)
    await evaluate(`[...document.querySelectorAll('nav button')].find(el=>el.innerText.includes('商品治理')).click()`)
    await pause(500)
    await evaluate(`document.querySelector('.table-detail-button').click()`)
    await pause(600)
    const result = await evaluate(`({dialog:!!document.querySelector('.listing-review-dialog'),text:document.querySelector('.listing-review-dialog')?.innerText,images:[...document.querySelectorAll('.review-gallery img')].filter(img=>img.complete&&img.naturalWidth>0).length,scrollbar:document.querySelector('.listing-review-dialog')&&getComputedStyle(document.querySelector('.listing-review-dialog')).scrollbarWidth})`)
    if (!result.dialog || !result.text.includes('待审核') || !result.text.includes('完整描述') || !result.text.includes('仅审核可见') || result.images !== 2 || result.scrollbar !== 'none') throw new Error(`Admin detail regression: ${JSON.stringify(result)}`)
    if (requests.some(route=>route.startsWith('/api/v1/listings/'))) throw new Error('Admin details used public listing API')
    await fs.writeFile(path.join(artifactDir, 'admin-review.json'), JSON.stringify({ ...result, requests }, null, 2))
    await fs.writeFile(path.join(artifactDir, 'admin-review.png'), Buffer.from((await client.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  } finally {
    await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected.identifier })
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}
