# Express

Mount the framework-neutral Own Auth handler in one Express 5 route. Complete the [Quickstart](https://own-auth.com/docs/quickstart) first so the shared `auth` instance and database tables are ready.

## Install

```bash
npm install own-auth express
npm install --save-dev @types/express
```

## Add the handler

Register the auth route before `express.json()` or any other middleware that consumes the request body. Own Auth reads and validates its own bounded request stream.

```ts server.ts
import { Readable } from "node:stream";
import express, {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import { createOwnAuthHandler } from "own-auth/http";

import { auth } from "./auth";

const app = express();
const requestContexts = new WeakMap<Request, {
  ipAddress?: string;
  userAgent?: string;
}>();
const authHandler = createOwnAuthHandler(auth, {
  getRequestContext: (request) => requestContexts.get(request) ?? {},
});

app.all("/api/auth/{*path}", async (request, response) => {
  const webRequest = toWebRequest(request);
  requestContexts.set(webRequest, {
    ipAddress: request.ip,
    userAgent: request.get("user-agent"),
  });
  await sendWebResponse(
    response,
    await authHandler(webRequest),
  );
});

// Register application body middleware after the auth catch-all route.
app.use(express.json());

app.listen(3000);

function toWebRequest(request: ExpressRequest): Request {
  const host = request.host;
  if (!host) throw new Error("Host header is required");

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: toWebHeaders(request),
  };

  if (hasBody) {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(
    new URL(request.originalUrl, `${request.protocol}://${host}`),
    init,
  );
}

function toWebHeaders(request: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(name, entry);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function sendWebResponse(
  expressResponse: ExpressResponse,
  response: Response,
): Promise<void> {
  expressResponse.status(response.status);
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") expressResponse.setHeader(name, value);
  }

  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) expressResponse.setHeader("set-cookie", cookies);

  expressResponse.send(Buffer.from(await response.arrayBuffer()));
}
```

This exposes the complete [HTTP handler contract](https://own-auth.com/docs/http-handler) under `/api/auth` without duplicating auth routes, cookie policy, MFA handling, CSRF checks, request validation, or error mapping inside Express.

The request-context bridge passes Express's resolved client IP to Own Auth so IP-based OAuth and One Tap limits remain active.

If Express runs behind a reverse proxy, configure `trust proxy` for the exact proxy boundary so `request.ip`, `request.host`, and `request.protocol` reflect the external request. Ensure that proxy overwrites forwarded host, protocol, and client-IP headers; do not trust values supplied directly by clients.

## Add the client

```ts auth-client.ts
import { createOwnAuthClient } from "own-auth/client";

export const authClient = createOwnAuthClient();
```
