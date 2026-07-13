# Hono

Mount the framework-neutral Own Auth handler in one Hono route. Complete the [Quickstart](https://own-auth.com/docs/quickstart) first so the shared `auth` instance and database tables are ready.

## Install

```bash
npm install own-auth hono @hono/node-server
```

## Add the handler

```ts server.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createOwnAuthHandler } from "own-auth/http";

import { auth } from "./auth";

const app = new Hono();
const authHandler = createOwnAuthHandler(auth);

app.all("/api/auth/*", (context) => authHandler(context.req.raw));

serve({ fetch: app.fetch, port: 3000 });
```

This exposes the complete [HTTP handler contract](https://own-auth.com/docs/http-handler) under `/api/auth`.

## Add the client

```ts auth-client.ts
import { createOwnAuthClient } from "own-auth/client";

export const authClient = createOwnAuthClient();
```

The handler owns request validation, safe errors, session cookies, and CSRF checks. Hono remains a thin request adapter and the Own Auth core stays framework-independent.
