# TypeScript Client

Use the framework-neutral client from browser TypeScript. It calls the Own Auth HTTP handler and uses its secure session cookie.

## Create the client

```ts auth-client.ts
import { createOwnAuthClient } from "own-auth/client";

export const authClient = createOwnAuthClient();
```

The default handler path is `/api/auth`. Set `baseURL` when the auth API uses a different origin or path:

```ts
export const authClient = createOwnAuthClient({
  baseURL: "https://api.example.com/api/auth",
});
```

Add that frontend origin to the handler's `trustedOrigins` when the client and API use different origins.

## Sign up and sign in

```ts
const session = await authClient.signUpEmailPassword({
  email: "alice@example.com",
  password: "her-secret-password",
  name: "Alice",
});
```

```ts
const session = await authClient.signInEmailPassword({
  email: "alice@example.com",
  password: "her-secret-password",
});
```

The browser stores the `HttpOnly` cookie from the handler. Raw session tokens are not exposed to browser JavaScript.

## Current session

```ts
const session = await authClient.getSession();

if (session) {
  console.log(session.user.email);
}
```

Subscribe to session changes without a UI framework:

```ts
const unsubscribe = authClient.subscribe(() => {
  const state = authClient.getSessionSnapshot();
  console.log(state.data, state.isPending, state.error);
});

unsubscribe();
```

## React

React applications can use the same client with a reactive session hook:

```tsx auth-client.ts
import { createOwnAuthReactClient } from "own-auth/react";

export const authClient = createOwnAuthReactClient();
```

```tsx account.tsx
import { authClient } from "./auth-client";

export function Account() {
  const { data, isPending, error } = authClient.useSession();

  if (isPending) return null;
  if (error) return <p>{error.message}</p>;
  if (!data) return <p>Not signed in</p>;

  return <p>Signed in as {data.user.email}</p>;
}
```

`useSession` loads the current session once, shares that request between mounted components, and updates after signup, signin, verification, password reset, or signout. All other methods are the same methods exposed by `own-auth/client`.

## Auth methods

The client includes:

- `signUpEmailPassword`
- `signInEmailPassword`
- `signOut`
- `getSession`
- `changePassword`
- `requestMagicLink`
- `verifyMagicLink`
- `requestEmailVerification`
- `verifyEmail`
- `requestPasswordReset`
- `resetPassword`
- `requestSmsOtp`
- `verifySmsOtp`
- `acceptInvite`

Each method's input and response types come from the same endpoint contract used by the handler and OpenAPI generator.

## Errors

```ts
import { OwnAuthClientError } from "own-auth/client";

try {
  await authClient.signInEmailPassword({ email, password });
} catch (error) {
  if (error instanceof OwnAuthClientError) {
    console.log(error.code, error.status);
  }
}
```

The error code is the stable value to handle in application logic. The message is safe to show to a user.
