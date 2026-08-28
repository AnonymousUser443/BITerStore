# Nginx Proxy Manager

Start the service with:

```bash
docker compose -f config.yaml up -d
```

Local ports:

- `19080`: HTTP entry for the FRP HTTP tunnel.
- `19443`: HTTPS entry for the FRP HTTPS tunnel.
- `19081`: admin UI, bound to localhost only.

Connect to the admin UI through SSH:

```bash
ssh -L 19081:127.0.0.1:19081 -p 33016 young@vip.hb.2.frp.one
```

Create a proxy host for `store.young581.com` using `http` and upstream `nginx:80`.

Initial proxy host settings:

- Domain Names: `store.young581.com`
- Scheme: `http`
- Forward Hostname / IP: `nginx`
- Forward Port: `80`
- Enable `Block Common Exploits`
- Enable `Websockets Support`
- Do not select an SSL certificate until the FRP HTTP tunnel targets `19080`

After the host is saved, change the FRP HTTP tunnel's local port from `18081`
to `19080`. In the current FRP topology, Cloudflare terminates public TLS and
forwards the original protocol in `X-Forwarded-Proto`, so a separate tunnel to
`19443` and a second NPM certificate are not required. Keep the NPM admin port
`19081` bound to localhost and access it only through SSH.

To reject plain HTTP while retaining Cloudflare TLS termination, add this to the
proxy host's **Advanced** configuration:

```nginx
if ($http_x_forwarded_proto = "http") {
  return 301 https://$host$request_uri;
}
```

The optional `configure-proxy-host.mjs` helper creates that host through the local
NPM API. It takes credentials from `NPM_IDENTITY` and `NPM_SECRET`; do not store
those values in this repository.
