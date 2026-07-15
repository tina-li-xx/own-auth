# Plugins

Plugins extend Own Auth with namespaced server methods, client methods, endpoints, errors, audit events, hooks, rate limits, and migrations.

## Define a plugin

```ts
import { defineOwnAuthPlugin } from "own-auth";

export const examplePlugin = defineOwnAuthPlugin({
  id: "example",
  version: "1.0.0",
  errors: ["not_available"],
  endpoints: [{
    id: "status",
    method: "GET",
    path: "/status",
    summary: "Read example status",
    session: "required",
    output: {
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
      additionalProperties: false,
    },
    handler: async ({ session }) => ({
      enabled: Boolean(session),
    }),
  }],
  clientMethods: {
    getStatus: { endpoint: "status" },
  },
});
```

Install it on the auth instance:

```ts
export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  plugins: [examplePlugin],
});
```

Plugin routes live under `/api/auth/plugins/{plugin-id}/...`. They cannot replace core routes, errors, cookies, CSRF behavior, or security checks.

## Server methods and security declarations

Server-only methods are also namespaced and called explicitly:

```ts
const result = await auth.callPluginMethod(
  "example",
  "recalculate",
  { userId },
  { sessionToken },
);
```

A plugin can declare:

- `rateLimits` referenced by its endpoints
- `trustedOrigins` accepted for that plugin's own HTTP endpoints
- `storageRequirements` checked when the auth instance starts
- `auditEvents` that it can write through `context.audit`
- `errors` returned as `plugin.{plugin-id}.{error}`

These declarations extend only the plugin namespace. They cannot replace or weaken core limits, session requirements, errors, cookies, or CSRF checks.

## Hooks

Before-hooks run sequentially with immutable input and an `AbortSignal`. Plugins run as trusted application code and can inspect the operation input. They do not use `next()`:

```ts
beforeHooks: [{
  id: "policy",
  operations: ["signInEmailPassword"],
  async run({ input, signal }) {
    const allowed = await policyService.check(input, { signal });
    return allowed ? undefined : { allow: false };
  },
}]
```

A throw, rejection, timeout, or explicit denial stops the operation. The default timeout is five seconds and applications may only shorten it.

After-hooks run after committed work. They receive secret-redacted input and results, cannot replace the result, and report failures without rolling back authentication.

## Migrations

Declare idempotent, forward-only SQL for each database dialect the plugin supports:

```ts
migrations: [{
  id: "001_records",
  sql: {
    postgres: `create table if not exists plugin_example_records (
      id text primary key
    )`,
    d1: `create table if not exists plugin_example_records (
      id text primary key
    )`,
  },
}]
```

Load third-party plugins for the CLI from `own-auth.config.ts`:

```ts
import { defineOwnAuthConfig } from "own-auth";
import { examplePlugin } from "./example-plugin";

export default defineOwnAuthConfig({
  plugins: [examplePlugin],
});
```

```bash
npx own-auth migrate
npx own-auth status
```

For D1, generate Wrangler migration files:

```bash
npx own-auth generate --dialect d1 --out-dir migrations
```

Generation fails before deployment when a configured plugin has no SQL for the selected dialect.

Every migration has a namespaced ID and SHA-256 checksum. Postgres applies each pending migration in its own transaction. D1 writes each plugin migration as a versioned file for Wrangler to apply transactionally. Automatic down migrations are not supported.

## Client and OpenAPI contracts

Create a client manifest and fingerprint from the configured plugins:

```ts
import { createOwnAuthPluginClientConfiguration } from "own-auth";

const pluginClient = createOwnAuthPluginClientConfiguration([examplePlugin]);
```

Pass `pluginClient.plugins` and `pluginClient.fingerprint` to `createOwnAuthClient`. A fingerprint mismatch means the generated client must be regenerated.

`createOwnAuthOpenApiDocument()` remains the stable core-only document. Use `createConfiguredOwnAuthOpenApiDocument(plugins)` for a document containing the configured plugin endpoints and contract fingerprint.
