import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { root } from './weapp-env.mjs'

const dist = path.join(root, 'dist')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp' }
http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0])
  let file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath)
  if (!file.startsWith(dist)) { response.statusCode = 403; response.end(); return }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  if (!fs.existsSync(file)) {
    response.statusCode = 503
    response.setHeader('Content-Type', 'text/plain; charset=utf-8')
    response.end('H5 build is not ready')
    return
  }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
  const stream = fs.createReadStream(file)
  stream.on('error', () => {
    if (!response.headersSent) response.statusCode = 503
    response.end()
  })
  stream.pipe(response)
}).listen(4173, '127.0.0.1', () => console.log('H5 preview http://127.0.0.1:4173'))
