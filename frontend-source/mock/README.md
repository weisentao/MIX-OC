# Mock API

Start the fake backend:

```bash
npm run mock
```

Default base URL:

```text
http://localhost:3000
```

Vite proxies frontend `/api/*` requests to this server.

Default login:

```text
username: admin
password: admin
```

Useful endpoints:

```text
POST   /login
GET    /me
GET    /appState/main
PUT    /appState/main
GET    /users
GET    /carouselNotices
GET    /tags
GET    /templates
GET    /rootProjects
GET    /projectGroups
```

`mock/db.json` is regenerated from `src/data/seed.js` by:

```bash
npm run mock:db
```
