# Contributing

Thanks for helping improve Own Auth.

## Setup

```bash
pnpm install
pnpm test
pnpm build
```

The API server requires Postgres:

```bash
createdb own_auth_dev
export DATABASE_URL=postgres://localhost:5432/own_auth_dev
psql "$DATABASE_URL" -f packages/core/migrations/001_initial.sql
pnpm dev
```

## Tests

Run everything:

```bash
pnpm test
```

Run the real Postgres integration test:

```bash
createdb own_auth_test
pnpm --filter own-auth test:integration
```

The integration test uses `OWN_AUTH_TEST_DATABASE_URL` first, then `DATABASE_URL`, then `postgres://localhost:5432/own_auth_test`.

## Pull Requests

- Keep changes small and focused.
- Add or update tests for auth behavior, storage behavior, or security-sensitive changes.
- Keep runtime storage durable. The API should require Postgres through `DATABASE_URL`.
- Do not commit secrets, `.env` files, or generated local databases.

## Release

Check the package before publishing:

```bash
pnpm run release:check
```

Publish the `own-auth` package:

```bash
pnpm run release:publish
```

Update `packages/core/package.json` before publishing a new version. npm package versions cannot be overwritten.
