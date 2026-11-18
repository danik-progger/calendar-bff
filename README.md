# Calendar BFF

Standalone Google-only Better Auth service. Calendar requests go directly from each client to the Rust API. Accounts and sessions live in Neon Postgres. The frontend in `../web` has no database access or auth server code.

Copy `.env.example` to `.env.local`, set the Neon connection strings, and run:

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run dev
```

The BFF listens at `http://127.0.0.1:3001`. Bun loads `.env` and `.env.local` for these scripts; Vercel supplies production variables. Run the frontend separately at `http://127.0.0.1:5174`; it proxies `/api/auth/*` here. `BETTER_AUTH_URL` stays the frontend origin, where browsers receive cookies and Google redirects. Set the Rust server's `AUTH_BASE_URL` to this BFF's origin, without `/api/auth`.

- `/api/auth/*`: Better Auth Google sign-in, session, and logout routes.
- Calendar endpoints are not served here.
- `/healthz`: process health, returning 204. Database connectivity is checked by migrations/auth requests; Rust `/healthz` checks its database connection.

## Vercel

Deploy this folder as its own project using `vercel.json`. Set:

```dotenv
DATABASE_URL=<Neon pooled connection string>
BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=https://<frontend-domain>
```

Then set `BFF_URL=https://<bff-domain>` in the **web** project and `AUTH_BASE_URL=https://<bff-domain>` in the **Rust** project. Redeploy projects after changing their variables. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` here to enable Google sign-in. Email/password login and email delivery are disabled. `DATABASE_URL_UNPOOLED` is used for explicit migrations, never browser requests. Preserve the existing `BETTER_AUTH_SECRET` when moving a deployment so existing sessions remain valid.

Set `VITE_CALENDAR_API_URL=https://<rust-domain>` in the web project. The frontend keeps the session token in memory and sends it directly to Rust as a bearer token.

The frontend uses Vercel's native external rewrite for authentication; it needs no API function. Google callbacks use `<frontend-domain>/api/auth/callback/google`, routed here. Native clients call this auth service directly, then send bearer sessions directly to the calendar API. Set `GOOGLE_DESKTOP_CLIENT_ID` here to accept desktop Google ID tokens alongside the web, iOS, and Android clients. See [shared setup](../shared/BACKEND.md) for the API protocol and migration steps.

## Checks

Oxlint handles linting and Oxfmt handles formatting. Run `bun run lint:fix` or `bun run format` to apply fixes. CI checks both.

```sh
bun run format:check
bun run lint
bun run build
BFF_TEST_DATABASE_URL=postgres://<local-test-database> bun run test
```

Tests use a disposable loopback Postgres database and exercise real Better Auth cookie/bearer sessions, auth-only routing, and logout revocation. CI provisions Postgres directly on its runner, without Docker.
