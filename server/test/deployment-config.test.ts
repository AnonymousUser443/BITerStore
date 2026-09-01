import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('production gateway', () => {
  it('redirects HTTP entry points to HTTPS before Secure cookie authentication', () => {
    const nginx = readFileSync(resolve(process.cwd(), '../deploy/nginx.conf'), 'utf8')

    expect(nginx).toContain('map $http_x_forwarded_proto $biterstore_redirect_https {')
    expect(nginx).toMatch(/map \$http_x_forwarded_proto \$biterstore_redirect_https \{\s+default 0;\s+~\*\^http\$ 1;/)
    expect(nginx).toContain('if ($biterstore_redirect_https) {')
    expect(nginx).toContain('return 308 https://store.young581.com$request_uri;')
    expect(nginx.indexOf('return 308 https://store.young581.com$request_uri;')).toBeLessThan(nginx.indexOf('location /api/'))
    expect(nginx.indexOf('return 308 https://store.young581.com$request_uri;')).toBeLessThan(nginx.indexOf('location / {'))
  })
})
