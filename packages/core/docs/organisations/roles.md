# Roles

Own Auth includes `owner`, `admin`, and `member` roles. Applications can add their own roles and permissions in the auth configuration.

## Built-in roles

| Role | Description |
|---|---|
| `owner` | Full control. Can manage members, change roles, update the organisation, and delete it. |
| `admin` | Can manage members and update the organisation. Cannot change roles or delete the organisation. |
| `member` | Basic access. Cannot manage members or update the organisation. |

| Permission | Owner | Admin | Member |
|---|---|---|---|
| `manage_organisation` | Yes | No | No |
| `invite_members` | Yes | Yes | No |
| `remove_members` | Yes | Yes | No |
| `change_member_roles` | Yes | No | No |
| `view_members` | Yes | Yes | Yes |
| `view_audit_events` | Yes | Yes | No |
| `manage_sessions` | Yes | Yes | No |
| `manage_api_keys` | Yes | Yes | No |
| `manage_basic_settings` | Yes | Yes | No |

## Custom roles and permissions

Define the authorization contract once and pass it to `createOwnAuth`:

```ts
import {
  createOwnAuth,
  defineOwnAuthAuthorization,
} from "own-auth";

const authorization = defineOwnAuthAuthorization({
  permissions: ["documents:read", "documents:write"],
  roles: {
    reviewer: ["view_members", "documents:read"],
    editor: ["view_members", "documents:read", "documents:write"],
  },
});

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  authorization,
});
```

TypeScript now accepts `reviewer` and `editor` anywhere this `auth` instance expects an organisation role. It also autocompletes the two configured document permissions:

```ts
await auth.inviteMember({
  organisationId,
  invitedByUserId: currentUser.id,
  email: "reviewer@example.com",
  role: "reviewer",
});

const allowed = await auth.checkPermission(
  organisationId,
  currentUser.id,
  "documents:read",
);
```

Custom roles can contain built-in permissions, custom permissions, or both. The built-in `owner` role automatically receives every configured custom permission. `admin` and `member` keep their built-in permissions unless the application assigns a custom role instead.

Role names must start with a lowercase letter, contain no more than 64 characters, and may use lowercase letters, numbers, underscores, and hyphens. Permission names follow the same lowercase rule, contain no more than 128 characters, and may also use colons and dots. Namespaced permissions such as `documents:read` are recommended.

Built-in role and permission names are reserved. Own Auth rejects duplicate names, invalid identifiers, and roles that reference an unconfigured permission when the auth instance is created.

## Check a permission

Use `checkPermission` when the application handles a denied action itself:

```ts
const allowed = await auth.checkPermission(
  organisationId,
  currentUser.id,
  "invite_members",
);
```

It returns `false` when the organisation, member, role, or permission is not available.

## Require a permission

Use `requirePermission` when the action must stop immediately. It returns the active membership when allowed, throws `permission_denied` when the member lacks the permission, and throws `role_not_configured` when the stored role is no longer configured.

```ts
const membership = await auth.requirePermission(
  organisationId,
  currentUser.id,
  "manage_api_keys",
);
```

Permission checks always require an active membership in the requested organisation.

## Owner protection

A custom role may receive `change_member_roles` or `remove_members`, but it cannot promote someone to owner, demote an owner, or remove an owner. Only an owner can perform those actions, and the last owner cannot be demoted or removed.

## Changing role configuration

Role definitions live in application configuration, not in a database table. Every Own Auth instance connected to the same database must use the same authorization definition.

Before removing a role, reassign every member who uses it. A member whose stored role is no longer configured fails every permission check. A pending invitation for a removed role fails with `role_not_configured`; the invitation token is not consumed, so it can be accepted after the role is restored or the invitation is replaced.

Run `npx own-auth migrate` before assigning custom roles. Migration `009_custom_authorization` replaces the old three-role database constraint with identifier validation while preserving existing memberships and invitations.

On D1, migration `009_custom_authorization` rebuilds the membership and invitation tables because SQLite cannot replace their existing role constraints in place. The migration copies every row and recreates the indexes inside the migration transaction. Its duration grows with the number of memberships and invitations, so allow it to finish before starting application traffic.

API-key scopes remain separate from organisation permissions. Own Auth stores and verifies API-key scopes, while the application decides how those scopes map to product actions.

## Next step

Learn about [Members](/docs/organisations/members) to assign roles, or [Invites](/docs/organisations/invites) to bring new members into an organisation.
