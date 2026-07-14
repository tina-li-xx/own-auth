# Passkeys

Passkeys can sign a user in directly or complete an MFA challenge. Both modes use the same credential storage and verification service.

## Configure WebAuthn

```ts
const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  passkeys: {
    rpId: "example.com",
    rpName: "Example",
    origins: ["https://example.com"],
  },
});
```

`rpId` is the relying-party domain. Every expected browser origin must be listed in `origins`.

## Register a passkey

Use `own-auth/passkeys` in browser code:

```ts
import { registerPasskey } from "own-auth/passkeys";

await registerPasskey(authClient, {
  name: "Laptop",
});
```

Registration requires a valid session and user verification. Discoverable credentials are requested by default. Older non-discoverable authenticators remain supported.

## Sign in

Usernameless sign-in works with discoverable credentials:

```ts
import { authenticateWithPasskey } from "own-auth/passkeys";

const session = await authenticateWithPasskey(authClient);
```

Non-discoverable credentials require username-first authentication. Resolve the user on the server and pass its ID when requesting options:

```ts
const { options } = await auth.beginPasskeyAuthentication({ userId: user.id });
```

## Complete MFA with a passkey

When a browser sign-in returns `mfa_required` and includes `passkey`:

```ts
await authenticateWithPasskey(authClient, { mfa: true });
```

The HTTP handler reads the pending MFA challenge from its HttpOnly cookie. A user-verified passkey creates an `aal2` session.

## Manage passkeys

```ts
const { passkeys } = await authClient.listPasskeys();

await authClient.renamePasskey({
  passkeyId: passkeys[0].id,
  name: "Work laptop",
});

await authClient.revokePasskey({ passkeyId: passkeys[0].id });
```

Own Auth validates the expected origin, RP ID, challenge, signature, credential ownership, and user verification. Challenges are hashed, expiring, and single-use. Non-zero counters use atomic comparison updates. Valid multi-device credentials whose counters remain zero follow WebAuthn's multi-device rules.
