# SCIM Provisioning

Provision organisation users and memberships from an identity provider through SCIM 2.0. SCIM manages access to one organisation. It does not delete, disable, or take ownership of the global Own Auth user account.

## Run The Migration

```bash
npx own-auth migrate
```

Migration `015_scim` adds SCIM connections, hashed bearer tokens, and organisation-scoped user resources.

## Enable SCIM

```ts auth.ts
import { createOwnAuth } from "own-auth";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  scim: {},
});
```

SCIM is disabled when `scim` is omitted. The built-in Postgres, Cloudflare D1, and in-memory adapters implement SCIM persistence. A custom adapter must implement `ScimCapableStorage`.

## Create A Connection

Only an organisation owner can create or manage a SCIM connection.

```ts
const connection = await auth.scim.createConnection({
  organisationId: organisation.id,
  actorUserId: currentUser.id,
  name: "Company provisioning",
  defaultRole: "member",
});
```

The default role must be a configured non-owner role. SCIM never accepts an owner role from an identity provider.

Before removing a custom role from the Own Auth authorization configuration, reassign every member and SCIM connection that uses it. An unconfigured role fails closed and cannot be used for provisioning or restoration.

## Create A Token

```ts
const { token, rawToken } = await auth.scim.createToken({
  connectionId: connection.id,
  actorUserId: currentUser.id,
  name: "Identity provider",
});
```

Give `rawToken` to the identity provider. It is returned only at creation. Own Auth stores its peppered hash and exposes only safe token metadata afterward.

The default SCIM base URL is:

```text
https://api.example.com/scim/v2
```

The identity provider sends:

```text
Authorization: Bearer oa_scim_...
```

List or revoke tokens through the owner-only SDK methods:

```ts
const tokens = await auth.scim.listTokens({
  connectionId: connection.id,
  actorUserId: currentUser.id,
});

await auth.scim.revokeToken({
  connectionId: connection.id,
  tokenId: tokens[0].id,
  actorUserId: currentUser.id,
});
```

## Mount The Handler

SCIM uses a separate framework-neutral handler because identity providers authenticate with a connection token, not an application session.

```ts scim-handler.ts
import { createOwnAuthScimHandler } from "own-auth/scim";

import { auth } from "./auth";

export const scimHandler = createOwnAuthScimHandler(auth, {
  getRequestContext(request) {
    return {
      ipAddress: getTrustedClientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    };
  },
});
```

Mount `scimHandler` at `/scim/v2/*`. Resolve the client IP through the framework's trusted-proxy configuration. Do not trust a forwarded header directly.

## Supported Endpoints

| Method | Path | Operation |
|---|---|---|
| `GET` | `/ServiceProviderConfig` | Read supported SCIM behavior |
| `GET` | `/ResourceTypes` | List resource types |
| `GET` | `/ResourceTypes/User` | Read the User resource type |
| `GET` | `/Schemas` | List schemas |
| `GET` | `/Schemas/{user-schema}` | Read the User schema |
| `POST` | `/Users` | Provision a user and organisation membership |
| `GET` | `/Users` | List or filter active SCIM resources |
| `GET` | `/Users/{id}` | Read one SCIM resource |
| `PUT` | `/Users/{id}` | Replace one SCIM resource |
| `PATCH` | `/Users/{id}` | Update supported User fields |
| `DELETE` | `/Users/{id}` | Remove organisation access and create a tombstone |

List requests support `id eq`, `externalId eq`, and `userName eq` filters. `userName` matching is exact after trimming, NFC normalization, and lowercase conversion. Pagination uses `startIndex` and `count`, with a maximum count of 100.

Request bodies use `application/scim+json` and are limited to 256 KiB by default.

Own Auth returns weak ETags such as `W/"3"`. Send the current value in `If-Match` for conditional `PUT`, `PATCH`, and `DELETE` requests. Every successful mutation compares and increments the stored integer version atomically.

## User Lifecycle

Creating a SCIM User creates:

- a global Own Auth user when no user is deliberately linked
- one membership in the connection's organisation
- one connection-scoped SCIM resource
- audit events for the provisioning result

A SCIM-created user has no password and its email begins unverified. The identity provider cannot set a password, mark the email verified, assign the owner role, or modify membership in another organisation.

Setting `active` to `false` suspends the organisation membership. Setting it back to `true` reactivates that same membership.

Deleting the SCIM resource permanently removes the organisation membership and keeps a tombstone. The global user account, sessions outside that organisation, and memberships in other organisations are not deleted or disabled.

The tombstone permanently reserves the connection's `externalId` and normalized `userName`. A normal `POST /Users` cannot reclaim either identifier.

## Account Linking

Explicit linking is the default. A SCIM request whose email already belongs to an Own Auth user returns a uniqueness conflict instead of silently taking over that account.

After the user has authenticated through an existing method, an organisation owner can deliberately link that user:

```ts
const resource = await auth.scim.linkUser({
  connectionId: connection.id,
  actorUserId: currentUser.id,
  userId: signedInUser.id,
  externalId: "workforce-123",
  userName: "alice@example.com",
  email: "alice@example.com",
});
```

Set `accountLinking: "email"` only when automatic linking is required:

```ts
await auth.scim.updateConnection({
  connectionId: connection.id,
  actorUserId: currentUser.id,
  accountLinking: "email",
});
```

Automatic linking requires an exact normalized email match to an existing verified user. The user must not already be a member of the organisation and must not be claimed by another SCIM connection in that organisation.

## Pair With SAML

A SCIM connection can pair with one SAML connection from the same organisation:

```ts
await auth.scim.updateConnection({
  connectionId: connection.id,
  actorUserId: currentUser.id,
  samlConnectionId: samlConnection.id,
});
```

After the SAML response passes the normal signature, issuer, audience, destination, request, time, and replay checks, Own Auth can resolve the active paired SCIM resource by its exact normalized email.

The first successful matching SAML sign-in marks the SCIM-created user's email verified. The update is conditional and the audit event is written only by the request that changes the email from unverified to verified. Later SAML sign-ins do not repeat the update or audit event.

The pairing does not trust an unsigned email, a different SAML connection, a disabled SCIM connection, a deleted resource, or an email that does not match exactly.

## Restore A Deleted Resource

Normal provisioning cannot reclaim a tombstone. An organisation owner can explicitly restore the original resource:

```ts
const restored = await auth.scim.restoreUser({
  connectionId: connection.id,
  scimUserId,
  actorUserId: currentUser.id,
});
```

Restoration fails unless all of these remain true:

- the connection is active
- the global user still exists and is enabled
- the original membership still exists in the removed state
- the membership role is still configured and is not owner
- no other membership path has reactivated that user in the organisation
- no other SCIM connection in the organisation has claimed the user
- no different resource holds the original `externalId` or normalized `userName`
- no active resource holds the original normalized email

Resolve the conflict first. `restoreUser` never overwrites another resource.

## Disable A Connection

```ts
await auth.scim.disableConnection({
  connectionId: connection.id,
  actorUserId: currentUser.id,
});
```

Disabling a connection immediately rejects every token for that connection. Re-enabling the connection allows non-expired, non-revoked tokens to authenticate again. Revoke tokens separately when they must never work again.

## Rate Limits

Authenticated SCIM traffic is limited to 1,200 requests per minute per connection by default. Failed bearer authentication is limited to 30 requests per minute per IP address when trusted IP context is available.

```ts
const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  scim: {
    requestLimit: 1_200,
    requestWindowMs: 60_000,
    failedAuthLimit: 30,
    failedAuthWindowMs: 60_000,
  },
});
```

## Not Supported In This Release

This SCIM surface intentionally excludes:

- Groups
- Bulk requests
- the `.search` endpoint
- sorting
- password provisioning
- browser-session authentication for SCIM routes
- global user deletion or disablement

SCIM provisions organisation access. Own Auth's normal authentication methods continue to own sign-in, sessions, MFA, and global user state.
