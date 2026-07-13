# HTTP Handler

Expose Own Auth through one framework-neutral handler built on the standard Web `Request` and `Response` APIs.

## Create the handler

```ts auth-handler.ts
import { createOwnAuthHandler } from "own-auth/http";

import { auth } from "./auth";

export const authHandler = createOwnAuthHandler(auth);
```

Mount `authHandler` at `/api/auth/*`. Frameworks that use Web `Request` and `Response` objects can call it directly.

```ts app/api/auth/[...path]/route.ts
import { authHandler } from "../../../../../auth-handler";

export const GET = authHandler;
export const POST = authHandler;
```

The auth engine remains framework-independent. The handler only translates HTTP requests into existing Own Auth methods.

## Endpoints

| Method | Path | Operation |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | Sign up with email and password |
| `POST` | `/api/auth/sign-in/email` | Sign in with email and password |
| `GET` | `/api/auth/session` | Get the current session |
| `POST` | `/api/auth/sign-out` | Sign out |
| `POST` | `/api/auth/password/change` | Change the current password |
| `POST` | `/api/auth/magic-link/request` | Send a magic link |
| `POST` | `/api/auth/magic-link/verify` | Verify a magic link |
| `POST` | `/api/auth/email-verification/request` | Send a verification link |
| `POST` | `/api/auth/email-verification/verify` | Verify an email address |
| `POST` | `/api/auth/password-reset/request` | Send a password reset link |
| `POST` | `/api/auth/password-reset/confirm` | Reset a password |
| `POST` | `/api/auth/sms/request` | Send an SMS code |
| `POST` | `/api/auth/sms/verify` | Verify an SMS code |
| `POST` | `/api/auth/invitations/accept` | Accept an organisation invitation |

The exported `ownAuthEndpointContract` contains each route's method, path, request schema, response schema, session behavior, and auth error codes.

JSON request bodies are limited to 64 KiB by default. Change `maxRequestBodyBytes` only when an application genuinely needs a different limit.

## Sessions

Signup, signin, magic-link verification, and phone login set an `HttpOnly` session cookie. The JSON response never contains the raw session token, password hash, or session-token hash.

The default cookie is:

```text
own_auth_session; Path=/; HttpOnly; SameSite=Lax
```

`Secure` is added automatically over HTTPS. It can only be disabled on localhost. Cookie-authenticated requests and `Authorization: Bearer <session-token>` requests use the same session verification path.

Customize the cookie when creating the handler:

```ts
export const authHandler = createOwnAuthHandler(auth, {
  cookie: {
    name: "session",
    sameSite: "strict",
  },
});
```

## CSRF protection

Mutation requests from a browser must come from the same origin as the handler. Add a frontend origin only when the frontend and auth API use different HTTPS origins:

```ts
export const authHandler = createOwnAuthHandler(auth, {
  trustedOrigins: ["https://app.example.com"],
});
```

HTTPS origins and local development origins are accepted. Cookie-authenticated mutation requests without an `Origin` header are rejected. Server and native clients can use a bearer session without browser cookie behavior.

## Errors

Every failure uses the same response shape:

```json
{
  "error": {
    "code": "invalid_credentials",
    "message": "Invalid email or password"
  }
}
```

| Status | Meaning |
|---|---|
| `400` | Invalid input, token, redirect, or request format |
| `401` | Invalid credentials, session, token, or code |
| `403` | Disabled user, missing permission, or failed CSRF check |
| `404` | Route or required resource not found |
| `409` | Existing email, member, key, or invitation conflict |
| `413` | Request body is larger than the configured limit |
| `429` | Rate limit or OTP attempt limit reached |
| `500` | Unexpected server failure with a safe public message |

Catch `OwnAuthClientError` in client code to read the typed `code`, `message`, and HTTP `status`.

## OpenAPI

Generate an OpenAPI 3.1 document from the same endpoint contract:

```ts
import { createOwnAuthOpenApiDocument } from "own-auth/http";

const openapi = createOwnAuthOpenApiDocument({
  title: "My App Auth API",
  version: "1.0.0",
  serverUrl: "https://api.example.com",
});
```

When the handler uses a custom cookie name, pass the same value as `sessionCookieName`.

Request schemas, response schemas, operation IDs, and endpoint error codes come from `ownAuthEndpointContract`. There is no second route definition to keep in sync.
