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
const result = await authClient.signUpEmailPassword({
  email: "alice@example.com",
  password: "her-secret-password",
  name: "Alice",
});
```

```ts
const result = await authClient.signInEmailPassword({
  email: "alice@example.com",
  password: "her-secret-password",
});
```

When `result.status` is `complete`, the browser stores the `HttpOnly` session cookie from the handler. When it is `mfa_required`, no session exists yet:

```ts
if (result.status === "mfa_required") {
  showMfaForm(result.methods, result.expiresAt);
} else {
  console.log(result.user.email);
}
```

Raw session and MFA challenge tokens are not exposed to browser JavaScript.

## OAuth

Redirect the current page to a provider:

```ts
await authClient.signInWithOAuth({
  provider: "google",
  destination: "/account",
});
```

Or complete OAuth in a popup:

```ts
const result = await authClient.signInWithOAuth({
  provider: "github",
  mode: "popup",
});
```

The popup opens synchronously, rejects blocked or closed popups, validates the callback origin, and times out after 120 seconds by default. Override that with `popupTimeoutMs`.

Google One Tap can use the neutral prepare and verify methods directly. The optional browser helper coordinates Google Identity Services:

```ts
import { signInWithGoogleOneTap } from "own-auth/google-one-tap";

const result = await signInWithGoogleOneTap(authClient, {
  clientId: "your-google-client-id",
});
```

## SAML SSO

The application chooses the organisation's configured connection and starts sign-in:

```ts
await authClient.signInWithSaml({
  connectionId: "samlc_...",
  destination: "/dashboard",
});
```

`signInWithSaml` requests the identity-provider URL from the Own Auth handler and navigates the current page to it. The identity provider posts the signed response back to the handler, which sets the session or MFA cookie before returning to the validated destination.

An existing signed-in user can deliberately link a SAML identity:

```ts
await authClient.linkSaml({
  connectionId: "samlc_...",
  destination: "/account/security",
});
```

Connection creation and management remain server-only under `auth.saml`. See [SAML SSO](/docs/saml).

## Multi-factor authentication

The handler keeps the pending challenge in its temporary HttpOnly cookie. Complete it with a TOTP or recovery code:

```ts
const session = await authClient.completeMfaWithTotp({ code });
```

```ts
const session = await authClient.completeMfaWithRecoveryCode({
  code: recoveryCode,
});
```

Enroll TOTP through `beginTotpEnrollment`, `confirmTotpEnrollment`, `regenerateRecoveryCodes`, and `disableTotp`. Recovery codes are returned once after confirmation or regeneration.

## Passkeys

Use the browser helper for the complete WebAuthn ceremony:

```ts
import {
  authenticateWithPasskey,
  registerPasskey,
} from "own-auth/passkeys";

await registerPasskey(authClient, { name: "Work laptop" });

const session = await authenticateWithPasskey(authClient);
```

Passkeys can also complete a pending MFA challenge:

```ts
const session = await authenticateWithPasskey(authClient, { mfa: true });
```

The lower-level client methods remain available when an application needs direct control over WebAuthn options and responses.

## Plugins

Configure generated plugin manifests and their fingerprint on the client:

```ts
import {
  createOwnAuthPluginClientConfiguration,
} from "own-auth";
import { createOwnAuthClient } from "own-auth/client";

const pluginConfig = createOwnAuthPluginClientConfiguration(plugins);
const authClient = createOwnAuthClient({
  plugins: pluginConfig.plugins,
  pluginFingerprint: pluginConfig.fingerprint,
});

const status = await authClient.plugin("example").call("getStatus");
```

The client rejects a response when the configured fingerprint differs from the server contract.

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
- `signInWithOAuth`
- `unlinkOAuthProvider`
- `prepareGoogleOneTap`
- `signInWithGoogleOneTap`
- `signInWithSaml`
- `linkSaml`
- `completeMfaWithTotp`
- `completeMfaWithRecoveryCode`
- `beginTotpEnrollment`
- `confirmTotpEnrollment`
- `disableTotp`
- `regenerateRecoveryCodes`
- `beginPasskeyRegistration`
- `completePasskeyRegistration`
- `beginPasskeyAuthentication`
- `completePasskeyAuthentication`
- `listPasskeys`
- `renamePasskey`
- `revokePasskey`
- `plugin`

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
