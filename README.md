# Own Auth

Own your auth. Own your users.

Framework-independent authentication for TypeScript. Backed by Postgres, controlled by you.

```bash
npm install own-auth
```

## Get Started

Run the migration to set up your database.

```bash
export DATABASE_URL=postgres://localhost:5432/your_database
export OWN_AUTH_TOKEN_PEPPER=replace-with-a-long-random-secret
npx own-auth migrate
```

Create your auth instance.

```ts
import { createOwnAuth } from "own-auth";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
});
```

Sign up, sign in, sign out.

```ts
const { user } = await auth.signUpEmailPassword({
  email: "user@example.com",
  password: "secure-password",
  name: "Jane",
});

const { sessionToken } = await auth.signInEmailPassword({
  email: "user@example.com",
  password: "secure-password",
});

const { user } = await auth.requireCurrentSession(sessionToken);

await auth.signOut(sessionToken);
```

That's it. You have working auth.

## Providers

Each provider is a single `send` function. Use any email or SMS service you want. Both are optional. Without one configured, tokens log to the console for development.

### Email

Required for magic links, email verification, password reset, and org invites.

```ts
import type { EmailProvider } from "own-auth";

const emailProvider: EmailProvider = {
  async send(message) {
    await emailClient.send({
      from: "auth@yourapp.com",
      to: message.to,
      subject: message.type === "magic_link" ? "Your login link" : "Verify your email",
      html: `<a href="${message.url}">Continue</a>`,
    });
  },
};

const appLink = "replace-with-the-url-your-app-handles";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  baseUrl: appLink,
  emailProvider,
});
```

### SMS

Required for phone/SMS login.

```ts
import type { SmsProvider } from "own-auth";

const smsProvider: SmsProvider = {
  async send(message) {
    await smsClient.send({
      from: "+15550001234",
      to: message.to,
      body: `Your code is ${message.code}`,
    });
  },
};

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  smsProvider,
});
```

### Managed Email

Skip this if your app sends its own emails. Use this if you want Own Auth to handle delivery for you.

```ts
import { OwnAuthManagedEmailProvider, createOwnAuth } from "own-auth";

const appLink = "replace-with-the-url-your-app-handles";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  baseUrl: appLink,
  emailProvider: new OwnAuthManagedEmailProvider({
    deliveryKey: process.env.OWN_AUTH_EMAIL_DELIVERY_KEY,
  }),
});
```

Managed delivery uses `https://api.own-auth.com/v1/email` by default.

## Magic Links

Passwordless email login. Own Auth creates a single-use link to the app, hashes the token, and calls the email provider.

Set `baseUrl` to the URL the app handles for auth links. That can be a route, universal link, deep link, or any other callback URL owned by the app.

```ts
// Request
await auth.requestMagicLink({
  email: "user@example.com",
  redirectUrl: "/dashboard",
});

// Verify
const { user, sessionToken } = await auth.verifyMagicLink({ token });
```

The app reads the token from the link, verifies it, saves the returned session, and then opens `redirectUrl`.

New users are created automatically. Disable with `allowMagicLinkSignup: false`.

`redirectUrl` supports any URL in your `redirectAllowlist`, including mobile deep links like `myapp://settings`.

## Phone / SMS Login

Six-digit codes, hashed and rate-limited.

```ts
// Request
await auth.requestSmsOtp({ phone: "+15551234567" });

// Verify
const { user, sessionToken } = await auth.verifySmsOtp({
  phone: "+15551234567",
  code: "123456",
});
```

New users are created automatically. Disable with `allowPhoneSignup: false`.

## External Provider Sign In

After your backend verifies an Apple or Google token, pass the verified provider identity to Own Auth.

```ts
const { user, sessionToken } = await auth.signInWithExternalProvider({
  provider: "google",
  providerAccountId: googleUser.sub,
  email: googleUser.email,
  emailVerified: googleUser.email_verified === true
});
```

Own Auth links the provider account, creates or finds the user, creates the session, and writes the audit events.

## Email Verification

```ts
await auth.requestEmailVerification({ email: "user@example.com" });
await auth.verifyEmail({ token });
```

## Password Reset

All existing sessions are revoked after a successful reset.

```ts
await auth.requestPasswordReset({ email: "user@example.com" });
await auth.resetPassword({ token, newPassword: "new-secure-password" });
```

## Change Password

For signed-in users who know their current password.

```ts
await auth.changePassword({
  sessionToken,
  currentPassword: "current-password",
  newPassword: "new-secure-password"
});
```

## API Keys

Scoped keys for machine-to-machine access. The raw key is returned once. Only the hash is stored.

```ts
const { rawKey } = await auth.createApiKey({
  name: "Production API",
  organisationId: org.id,
  actorUserId: user.id,
  scopes: ["users:read", "users:write"],
});

// rawKey looks like: oa_x8kLm2nQ_...
```

Verify incoming requests.

```ts
const { apiKey, user, organisation } = await auth.verifyApiKey(
  request.headers.authorization,
  ["users:read"]
);
```

Revoke a key.

```ts
await auth.revokeApiKey(apiKey.keyPrefix, user.id);
```

## Organisations

Create organisations, invite members, assign roles.

```ts
const { organisation } = await auth.createOrganisation({
  name: "Acme Inc",
  ownerUserId: user.id,
});

await auth.inviteMember({
  organisationId: organisation.id,
  email: "teammate@example.com",
  invitedByUserId: user.id,
  role: "member",
});

const { user, member } = await auth.acceptInvitation({ token });
```

### Roles and Permissions

Built-in roles: `owner`, `admin`, `member`.

```ts
const allowed = await auth.checkPermission(orgId, userId, "invite_members");

// Or throw if denied
await auth.requirePermission(orgId, userId, "manage_api_keys");
```

### Manage Members

```ts
await auth.changeMemberRole({
  organisationId: orgId,
  memberId: member.id,
  role: "admin",
  actorUserId: currentUser.id,
});

await auth.removeMember({
  organisationId: orgId,
  memberId: member.id,
  actorUserId: currentUser.id,
});
```

## Audit Logs

Every auth action is logged automatically. Sign ups, sign ins, password resets, API key usage, org changes.

```ts
const events = await auth.listAuditEvents({
  userId: user.id,
  organisationId: org.id,
});
```

## Configuration

```ts
const appLink = "replace-with-the-url-your-app-handles";

createOwnAuth({
  // Required
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,

  // URL the app handles for auth links
  baseUrl: appLink,

  // Providers (default: log to console)
  emailProvider,
  smsProvider,

  // Signup controls
  allowMagicLinkSignup: true,
  allowPhoneSignup: true,

  // Session durations
  session: {
    ttlMs: 30 * 24 * 60 * 60 * 1000,       // 30 days absolute
    idleTtlMs: 7 * 24 * 60 * 60 * 1000,     // 7 days idle
  },

  // Token expiry
  tokenTtlMs: {
    magic_link: 15 * 60 * 1000,              // 15 minutes
    email_verification: 24 * 60 * 60 * 1000, // 24 hours
    password_reset: 60 * 60 * 1000,          // 1 hour
    organisation_invite: 7 * 24 * 60 * 60 * 1000, // 7 days
  },

  // SMS OTP
  sms: {
    otpTtlMs: 10 * 60 * 1000, // 10 minutes
    maxAttempts: 5,
    codeLength: 6,
  },

  // Password policy
  password: {
    minLength: 8,
  },

  // Security
  redirectAllowlist: [appLink],

  // Development only. Exposes raw tokens in responses.
  exposeRawTokens: false,
});
```

## Database Setup

Auto-migrate (recommended):

```bash
npx own-auth migrate
```

Own Auth saves users, sessions, tokens, API keys, organisations, and rate-limit attempts in Postgres.

Or generate SQL and apply it yourself:

```bash
npx own-auth generate --out own-auth.sql
psql "$DATABASE_URL" -f own-auth.sql
```

## Method Reference

| Area | Methods |
|---|---|
| **Users** | `createUser` `signUpEmailPassword` `signInEmailPassword` |
| **Sessions** | `getCurrentSession` `requireCurrentSession` `signOut` `revokeAllSessions` |
| **Magic Links** | `requestMagicLink` `verifyMagicLink` |
| **External Providers** | `signInWithExternalProvider` |
| **Email Verification** | `requestEmailVerification` `verifyEmail` |
| **Passwords** | `requestPasswordReset` `resetPassword` `changePassword` |
| **SMS OTP** | `requestSmsOtp` `verifySmsOtp` |
| **API Keys** | `createApiKey` `verifyApiKey` `revokeApiKey` |
| **Organisations** | `createOrganisation` `updateOrganisation` |
| **Members & Invites** | `inviteMember` `acceptInvitation` `changeMemberRole` `removeMember` |
| **Permissions** | `checkPermission` `requirePermission` |
| **Audit Logs** | `listAuditEvents` |

## Security

- Passwords hashed with scrypt
- Session tokens, magic links, reset tokens, SMS codes, and API keys hashed before storage
- Single-use tokens with expiry
- Rate limiting on all sensitive flows
- Account enumeration protection on reset and verification endpoints
- Redirect URL allowlist for magic links

## Docs

- [Installation](./docs/installation.md)
- [Security Model](./docs/security-model.md)
- [Security Policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## Release

```bash
pnpm run release:publish
```

This runs the release checks, publishes `own-auth`, then creates and pushes the matching Git tag, such as `v0.1.9`.

## License

MIT
