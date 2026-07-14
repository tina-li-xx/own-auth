# Fastify

Use Own Auth from Fastify 5 routes. Complete the [Quickstart](https://own-auth.com/docs/quickstart) first so the shared `auth` instance and database tables are ready.

## Install

```bash
npm install own-auth fastify @fastify/cookie
```

## Complete Server

This server provides signup, signin, current-session, and signout routes. Register `@fastify/cookie` before the routes so request cookies and reply cookie methods are available.

```ts server.ts
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { AuthError } from "own-auth";

import { auth } from "./auth";

type Credentials = {
  email: string;
  password: string;
  name?: string;
};

type MfaBody = {
  code: string;
  method: "totp" | "recovery_code";
};

const app = Fastify({ logger: true });
const sessionCookieName = "own_auth_session";
const mfaCookieName = "own_auth_mfa";
const sessionCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

await app.register(cookie);

app.post<{ Body: Credentials }>("/auth/signup", async (request, reply) => {
  const result = await auth.signUpEmailPassword(request.body);

  reply.setCookie(sessionCookieName, result.sessionToken, {
    ...sessionCookieOptions,
    expires: result.session.expiresAt,
  });

  return reply.code(201).send({ user: result.user });
});

app.post<{ Body: Credentials }>("/auth/signin", async (request, reply) => {
  const result = await auth.signInEmailPassword(request.body);

  if (result.status === "mfa_required") {
    reply.setCookie(mfaCookieName, result.challengeToken, {
      ...sessionCookieOptions,
      expires: result.expiresAt,
    });
    return reply.code(202).send({
      status: result.status,
      methods: result.methods,
      expiresAt: result.expiresAt,
    });
  }

  reply.setCookie(sessionCookieName, result.sessionToken, {
    ...sessionCookieOptions,
    expires: result.session.expiresAt,
  });

  return reply.send({ user: result.user });
});

app.post<{ Body: MfaBody }>("/auth/mfa", async (request, reply) => {
  const challengeToken = request.cookies[mfaCookieName];
  if (!challengeToken) {
    return reply.code(401).send({ error: "MFA challenge expired" });
  }

  const result = request.body.method === "recovery_code"
    ? await auth.completeMfaWithRecoveryCode({
        challengeToken,
        code: request.body.code,
      })
    : await auth.completeMfaWithTotp({
        challengeToken,
        code: request.body.code,
      });

  reply.clearCookie(mfaCookieName, { path: sessionCookieOptions.path });
  reply.setCookie(sessionCookieName, result.sessionToken, {
    ...sessionCookieOptions,
    expires: result.session.expiresAt,
  });
  return reply.send({ user: result.user });
});

app.get("/auth/session", async (request, reply) => {
  const sessionToken = request.cookies[sessionCookieName];
  const current = sessionToken
    ? await auth.getCurrentSession(sessionToken)
    : null;

  if (!current) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  return reply.send({
    session: current.session,
    user: current.user,
  });
});

app.post("/auth/signout", async (request, reply) => {
  const sessionToken = request.cookies[sessionCookieName];

  if (sessionToken) {
    await auth.signOut(sessionToken);
  }

  reply.clearCookie(sessionCookieName, {
    path: sessionCookieOptions.path,
  });

  return reply.code(204).send();
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AuthError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.safeMessage,
      },
    });
  }

  request.log.error(error);
  return reply.code(500).send({
    error: {
      code: "internal_error",
      message: "Authentication failed",
    },
  });
});

await app.listen({
  host: "0.0.0.0",
  port: 3000,
});
```

The browser receives only the `HttpOnly` session cookie. Raw session tokens are not returned in the JSON responses.
