const baseUrl = process.env.NPM_API_URL ?? "http://127.0.0.1:81/api";
const identity = process.env.NPM_IDENTITY;
const secret = process.env.NPM_SECRET;
const domain = process.env.PROXY_DOMAIN ?? "store.young581.com";
const forwardHost = process.env.PROXY_FORWARD_HOST ?? "nginx";
const forwardPort = Number(process.env.PROXY_FORWARD_PORT ?? "80");

if (!identity || !secret) {
  throw new Error("NPM_IDENTITY and NPM_SECRET are required");
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${payload.message ?? "unknown error"}`);
  }

  return payload;
}

const login = await request("/tokens", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identity, secret }),
});

const headers = {
  authorization: `Bearer ${login.token}`,
  "content-type": "application/json",
};
const hosts = await request("/nginx/proxy-hosts", { headers });
const existing = hosts.find((host) => host.domain_names?.includes(domain));

if (existing) {
  console.log(`Proxy host already exists: ${domain} (id=${existing.id})`);
  process.exit(0);
}

const created = await request("/nginx/proxy-hosts", {
  method: "POST",
  headers,
  body: JSON.stringify({
    domain_names: [domain],
    forward_scheme: "http",
    forward_host: forwardHost,
    forward_port: forwardPort,
    access_list_id: 0,
    certificate_id: 0,
    ssl_forced: false,
    caching_enabled: false,
    block_exploits: true,
    advanced_config: "",
    meta: { letsencrypt_agree: false, dns_challenge: false },
    allow_websocket_upgrade: true,
    http2_support: false,
    hsts_enabled: false,
    hsts_subdomains: false,
    locations: [],
  }),
});

console.log(`Proxy host created: ${domain} (id=${created.id})`);
