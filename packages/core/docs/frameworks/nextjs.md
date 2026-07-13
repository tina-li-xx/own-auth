# Next.js

Use the framework-neutral Own Auth handler from one App Router catch-all route. Complete the [Quickstart](https://own-auth.com/docs/quickstart) first so the shared `auth` instance and database tables are ready.

## Add the route

```ts app/api/auth/[...path]/route.ts
import { createOwnAuthHandler } from "own-auth/http";

import { auth } from "@/auth";

const handler = createOwnAuthHandler(auth);

export const GET = handler;
export const POST = handler;
```

That route exposes the complete [HTTP handler contract](https://own-auth.com/docs/http-handler) under `/api/auth`.

## Add the client

```ts lib/auth-client.ts
import { createOwnAuthClient } from "own-auth/client";

export const authClient = createOwnAuthClient();
```

The handler sets and clears the `HttpOnly` session cookie. It also validates browser request origins and returns the shared typed error format. No Next.js auth logic is added to the Own Auth core.

## Separate frontend and API origins

If the Next.js frontend calls an auth API on another HTTPS origin, allow that frontend origin in the handler:

```ts
const handler = createOwnAuthHandler(auth, {
  trustedOrigins: ["https://app.example.com"],
});
```

Configure the API's CORS response separately so credentialed browser requests can reach it.
