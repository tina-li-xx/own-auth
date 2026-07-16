# Administration

Use `auth.admin` for privileged support operations such as finding a user, reviewing their sessions and audit history, disabling access, or revoking sessions.

Administration is disabled by default. Own Auth does not decide who your support staff or system administrators are. Your backend supplies one authorization callback, and every administration operation must pass it.

## Configure authorization

```ts
import { createOwnAuth } from "own-auth";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  administration: {
    authorize: ({ actor, action, targetUserId }) =>
      canUseAuthAdministration({
        actorUserId: actor.id,
        action,
        targetUserId,
      }),
  },
});
```

`canUseAuthAdministration` is your application's system-level permission check. It can read an internal staff role, a support permission, or another policy owned by your backend.

Organisation roles do not grant administration access. An organisation owner or administrator has no `auth.admin` access unless the callback allows it.

The callback receives:

| Field | Description |
|---|---|
| `actor` | The active user making the request. Password hashes are never included. |
| `action` | The exact administration action, such as `users:read` or `sessions:revoke`. |
| `targetUserId` | The affected user ID. This is `undefined` for `users:list`. |

Returning `false`, throwing, or rejecting denies the operation. The actor object is immutable.

The built-in Postgres, Cloudflare D1, and in-memory adapters support administration. A custom adapter only needs administration support when this option is configured. In that case, implement the exported `AdministrationCapableStorage` interface, including user search and the cursor and limit fields on audit queries. Own Auth fails during setup if the configured adapter does not provide `listUsers`.

## List users

```ts
const page = await auth.admin.listUsers({
  actorUserId: currentUser.id,
  query: "alice",
  status: "active",
  limit: 50,
});

// page.items[0] -> { id, email, phone, name, disabledAt, createdAt, ... }
// page.nextCursor -> pass this to the next request, or null
```

Search follows fixed matching rules:

1. An exact user ID returns only that user.
2. An exact E.164 phone number returns only that user.
3. Other text is matched as a case-insensitive prefix against email and name.

Use `status: "active"`, `"disabled"`, or `"all"`. The default is `"all"`. Results are ordered by creation time and user ID, newest first. Cursors are signed and contain only the creation timestamp and user ID already visible in the response.

## Get a user

```ts
const user = await auth.admin.getUser({
  actorUserId: currentUser.id,
  userId: "usr_...",
});
```

Administration user records never include password hashes.

## Review sessions

```ts
const sessions = await auth.admin.listUserSessions({
  actorUserId: currentUser.id,
  userId: "usr_...",
});
```

Session records never include token hashes or raw session tokens. `effectiveStatus` is one of `active`, `disabled_user`, `expired`, or `revoked`.

Disabling a user makes every session ineffective as soon as `disabledAt` is stored. Session cleanup follows immediately. If the process stops between those steps, stored session rows may not yet have `revokedAt`, but verification still rejects them and administration reports `effectiveStatus: "disabled_user"`.

## Review audit events

```ts
const page = await auth.admin.listUserAuditEvents({
  actorUserId: currentUser.id,
  userId: "usr_...",
  limit: 50,
});
```

Pass `page.nextCursor` to load the next page.

## Disable or enable a user

```ts
await auth.admin.disableUser({
  actorUserId: currentUser.id,
  userId: "usr_...",
  reason: "Support confirmed an account takeover report",
});

await auth.admin.enableUser({
  actorUserId: currentUser.id,
  userId: "usr_...",
  reason: "Account recovery completed",
});
```

Reasons are required, limited to 500 characters, and stored in the audit log. Do not put passwords, tokens, API keys, other secrets, or unnecessary personal data in a reason. Free-text reasons are not included in webhook payloads.

## Revoke all user sessions

```ts
const revoked = await auth.admin.revokeUserSessions({
  actorUserId: currentUser.id,
  userId: "usr_...",
  reason: "User requested sign-out on every device",
});
```

The return value is the number of active session rows that were revoked.

## HTTP routes

When `administration` is configured, the framework-neutral handler exposes:

| Method | Route |
|---|---|
| `GET` | `/admin/users` |
| `GET` | `/admin/user` |
| `GET` | `/admin/user/sessions` |
| `GET` | `/admin/user/audit-events` |
| `POST` | `/admin/user/disable` |
| `POST` | `/admin/user/enable` |
| `POST` | `/admin/user/sessions/revoke` |

The handler derives the actor from the verified session. Requests cannot supply an actor ID. Cookie-authenticated mutations use the same CSRF protection as other Own Auth routes.

If administration is not configured, these routes return `404`. Removing the configuration makes them disappear on the next deployment.

Administration operations share a rate limit of 120 requests per minute for each actor. This applies to both direct `auth.admin` calls and HTTP routes.

Administration routes are omitted from the default core OpenAPI document. Include them only for a configured deployment:

```ts
const document = createOwnAuthOpenApiDocument({
  includeAdministration: true,
});
```
