Install dependencies, configure the environment variables, then start the local
API server:

```sh
npm install
npm run dev
```

The API listens on `http://localhost:3000`. Configure `FRONTEND_URL` as the
frontend's exact origin (scheme and hostname, without a path). For the deployed
frontend, set it in the backend project's Vercel environment variables to
`https://kakeibo-app-frontend-seven.vercel.app`, then redeploy the backend.

The database variables `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`,
`DATABASE_USER`, and `DATABASE_PASSWORD` must also be configured in the backend
environment. Database connection setup is deferred until an API request needs
the database, so CORS preflight requests can succeed independently.
