import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = { scenarios: { campus_peak: { executor: 'constant-vus', vus: 100, duration: '30m' } }, thresholds: { http_req_failed: ['rate<0.01'], 'http_req_duration{kind:listings}': ['p(95)<300'] } }
const base = __ENV.API_URL || 'http://localhost:8080/api/v1'
export default function () {
  // Local/isolated runs pass through the same trusted-edge address header as
  // production. Each VU represents a distinct client; never target production.
  const clientAddress = `198.51.${Math.floor((__VU - 1) / 250) + 100}.${((__VU - 1) % 250) + 1}`
  const response = http.get(`${base}/listings?limit=20`, {
    headers: { 'CF-Connecting-IP': clientAddress, 'X-Forwarded-Proto': 'https' },
    tags: { kind: 'listings' },
  })
  check(response, { 'listings returns 200': (value) => value.status === 200 })
  sleep(3 + Math.random() * 2)
}
