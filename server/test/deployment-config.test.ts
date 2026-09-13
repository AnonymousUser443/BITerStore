import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production gateway', () => {
  it('redirects HTTP entry points to HTTPS before Secure cookie authentication', () => {
    const nginx = readFileSync(resolve(process.cwd(), '../deploy/nginx.conf'), 'utf8')

    expect(nginx).toContain('map $http_cf_visitor $biterstore_forwarded_proto {')
    expect(nginx).toContain('map $http_x_forwarded_proto $biterstore_edge_proto {')
    expect(nginx).toContain("'{\"scheme\":\"https\"}' https;")
    expect(nginx).toContain('map $biterstore_forwarded_proto $biterstore_redirect_https {')
    expect(nginx).toContain('https 0;')
    expect(nginx).toContain('if ($biterstore_redirect_https) {')
    expect(nginx).toContain('return 308 https://store.young581.com$request_uri;')
    expect(nginx.indexOf('return 308 https://store.young581.com$request_uri;')).toBeLessThan(nginx.indexOf('location /api/'))
    expect(nginx.indexOf('return 308 https://store.young581.com$request_uri;')).toBeLessThan(nginx.indexOf('location / {'))
    expect(nginx).toContain('map $biterstore_forwarded_proto $biterstore_redirect_https {')
    expect(nginx).toContain('map $biterstore_forwarded_proto $biterstore_hsts {')
    expect(nginx).toContain('add_header Strict-Transport-Security $biterstore_hsts always;')
    expect(nginx).toContain('add_header X-Content-Type-Options nosniff always;')
    expect(nginx).toContain('add_header X-Frame-Options DENY always;')
    expect(nginx).toContain('add_header Permissions-Policy')
    expect(nginx).toContain("location /media/")
    expect(nginx).toContain('proxy_set_header X-Forwarded-Proto $biterstore_forwarded_proto;')
    expect(nginx).toContain("location /api/")
    expect(nginx).toContain("location / {")
  })
})
