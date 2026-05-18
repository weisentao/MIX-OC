# Frontend Deployment Guide - First Release

## 1) Build

In `G:\mutou\xm\xjg` run:

```bash
npm install
npm run build
```

Production API base URL is controlled by `.env.production`:

```env
VITE_API_BASE_URL=/api
```

Do not deploy the first release with an absolute backend URL in `VITE_API_BASE_URL`; keep frontend requests relative to `/api`.

## 2) Build Output

After build, static files are generated in:

- `G:\mutou\xm\xjg\dist`
- entry file: `G:\mutou\xm\xjg\dist\index.html`
- assets directory: `G:\mutou\xm\xjg\dist\assets`

## 3) Static Hosting / Nginx

Deploy the contents of `dist` to your static root, for example:

- `/var/www/xjg-frontend/`

The app uses Vue hash routing (`/#/...`). Browser refreshes should keep serving the same static `index.html` and must not return a server-side `404` or blank page. Keep `/index.html` directly accessible and use a normal static fallback for non-asset paths.

Example Nginx config:

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/xjg-frontend;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    # Keep the trailing slash so /api/login is proxied to backend /login.
    proxy_pass http://127.0.0.1:13001/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 4) API Reverse Proxy

Frontend calls `/api` by default in production.
Nginx or the static hosting gateway must reverse proxy `/api/*` to backend `http://127.0.0.1:13001/*`.

## 5) Build Size Note

Current first-release build may report Vite chunk-size warnings for large board/drawing dependencies. This is a performance warning, not a failed build. Keep it visible for later optimization, but do not block first release only because of this warning.

## 6) Verify After Deploy

- Open `http(s)://your-domain.com/index.html`
- Confirm page loads and requests are sent to `/api/*`
- Confirm backend receives requests on port `13001`
- Refresh a hash route such as `http(s)://your-domain.com/#/` and confirm it does not white-screen

