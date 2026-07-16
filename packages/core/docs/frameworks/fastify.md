# Fastify

Mount the framework-neutral Own Auth handler in one Fastify 5 route. Complete the [Quickstart](https://own-auth.com/docs/quickstart) first so the shared `auth` instance and database tables are ready.

## Install

```bash
npm install own-auth fastify
```

## Add the handler

Keep the auth routes in an encapsulated Fastify plugin. The scoped content-type parser preserves the original bounded request body for Own Auth instead of parsing auth payloads a second time.

```ts server.ts
import Fastify, { type FastifyRequest } from "fastify";
import { createOwnAuthHandler } from "own-auth/http";

import { auth } from "./auth";

const maxAuthBodyBytes = 64 * 1024;
const app = Fastify({ logger: true });
const requestContexts = new WeakMap<Request, {
  ipAddress?: string;
  userAgent?: string;
}>();
const authHandler = createOwnAuthHandler(auth, {
  maxRequestBodyBytes: maxAuthBodyBytes,
  getRequestContext: (request) => requestContexts.get(request) ?? {},
});

app.register((routes, _options, done) => {
  routes.removeAllContentTypeParsers();
  routes.addContentTypeParser(
    "*",
    { parseAs: "buffer", bodyLimit: maxAuthBodyBytes },
    (_request, body, parseDone) => parseDone(null, body),
  );

  routes.setErrorHandler((error, _request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({
        error: { code: "invalid_request", message: "Request body is too large" },
      });
    }
    if (error.code === "FST_ERR_CTP_INVALID_CONTENT_LENGTH") {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "Invalid Content-Length" },
      });
    }
    throw error;
  });

  routes.all("/*", { bodyLimit: maxAuthBodyBytes }, async (request, reply) => {
    const webRequest = toWebRequest(request);
    requestContexts.set(webRequest, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
    return reply.send(await authHandler(webRequest));
  });

  done();
}, { prefix: "/api/auth" });

await app.listen({ host: "0.0.0.0", port: 3000 });

function toWebRequest(request: FastifyRequest): Request {
  if (!request.host) throw new Error("Host header is required");

  const method = request.method.toUpperCase();
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: toWebHeaders(request),
  };

  if (method !== "GET" && method !== "HEAD" && Buffer.isBuffer(request.body)) {
    init.body = request.body;
    init.duplex = "half";
  }

  return new Request(
    new URL(request.raw.url ?? "/", `${request.protocol}://${request.host}`),
    init,
  );
}

function toWebHeaders(request: FastifyRequest): Headers {
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
```

This exposes the complete [HTTP handler contract](https://own-auth.com/docs/http-handler) under `/api/auth` without duplicating auth routes, cookie policy, MFA handling, CSRF checks, request validation, or error mapping inside Fastify.

The request-context bridge passes Fastify's resolved client IP to Own Auth so IP-based OAuth and One Tap limits remain active. The scoped error handler also keeps Fastify's pre-handler body-limit failures in Own Auth's public error shape.

If Fastify runs behind a reverse proxy, configure `trustProxy` for the exact proxy boundary so `request.ip`, `request.host`, and `request.protocol` reflect the external request. Ensure that proxy overwrites forwarded host, protocol, and client-IP headers; do not trust values supplied directly by clients.

## Add the client

```ts auth-client.ts
import { createOwnAuthClient } from "own-auth/client";

export const authClient = createOwnAuthClient();
```
