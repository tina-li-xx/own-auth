# Installation

## 1. Install

```bash
npm install own-auth
```

## 2. Set Environment Variables

```bash
DATABASE_URL=postgres://localhost:5432/own_auth
OWN_AUTH_TOKEN_PEPPER=replace-with-a-long-random-secret
```

Use your real Postgres username, password, host, and database name.

`OWN_AUTH_TOKEN_PEPPER` must stay only on your backend server. It is not for browser code, mobile apps, or public environment variables. Own Auth uses it to hash login links, SMS codes, sessions, and API keys before storing them.

## 3. Create Auth

Create `auth.ts` in the backend:

```ts
import { createOwnAuth } from "own-auth";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER
});
```

## 4. Create Database Tables

### Default

Run this once after setting `DATABASE_URL`. It creates the Own Auth tables in that Postgres database.

```bash
npx own-auth migrate
```

Use this path for normal setup.

### Advanced: Manual SQL

```bash
npx own-auth generate --out own-auth.sql
```

Then apply the file:

```bash
psql "$DATABASE_URL" -f own-auth.sql
```

## 5. Use Auth

For full signup, signin, session, signout, magic link, email verification, password reset, SMS OTP, organisation, and API key examples, see the [README](../README.md).

```ts
const signup = await auth.signUpEmailPassword({
  email: "user@example.com",
  password: "secure-password"
});

const session = await auth.getCurrentSession(signup.sessionToken);
```

## 6. Send Email and SMS (Optional)

Magic links, email verification, password reset, and SMS login need a delivery provider. Each is independent. Add the ones you need. Without a provider, delivery events are written to the server console for development.

See [Send Email and SMS](../README.md#send-email-and-sms).

## Production Requirements

- Postgres through `DATABASE_URL`
- strong `OWN_AUTH_TOKEN_PEPPER`
- real email delivery if using magic links, verification, or password reset
- real SMS provider if using phone login
- HTTPS
- backups for identity tables

## Repo Integration Test

```bash
createdb own_auth_test
pnpm --filter own-auth test:integration
```

The test uses `OWN_AUTH_TEST_DATABASE_URL` first, then `DATABASE_URL`, then `postgres://localhost:5432/own_auth_test`.
