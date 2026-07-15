# Webhooks

Send signed authentication events to application endpoints. Own Auth stores each subscribed event in a durable outbox, records every delivery attempt, and retries temporary failures.

Webhooks are optional. Nothing is sent unless endpoints are configured and the application runs the delivery processor.

## Configure an endpoint

```ts
import { createOwnAuth } from "own-auth";

export const auth = createOwnAuth({
  tokenPepper: process.env.OWN_AUTH_TOKEN_PEPPER,
  webhooks: {
    endpoints: [{
      id: "application-events",
      url: process.env.OWN_AUTH_WEBHOOK_URL!,
      secret: process.env.OWN_AUTH_WEBHOOK_SECRET!,
      events: [
        "user.signed_up",
        "user.signed_in",
        "password.changed",
        "member.invited",
      ],
    }],
  },
});
```

Each endpoint needs:

| Option | Description |
|---|---|
| `id` | Stable identifier containing 1 to 64 letters, numbers, underscores, or hyphens. |
| `url` | HTTPS destination. HTTP is accepted only for `localhost`, `127.0.0.1`, and `[::1]`. |
| `secret` | Endpoint-specific signing secret containing at least 32 UTF-8 bytes. |
| `events` | Core authentication events sent to this endpoint. |

Generate a signing secret with Node.js 20:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Endpoint IDs must be unique. Give each endpoint a different secret. Unknown events, plugin events, duplicate subscriptions, unsafe URLs, and short secrets fail when `createOwnAuth()` runs.

Endpoint IDs are also bounded telemetry labels. Use static names and do not include user, tenant, or request data.

The exported `coreAuditEventTypes` array contains every event that can be subscribed to:

```ts
import { coreAuditEventTypes } from "own-auth";
```

## Run the delivery processor

Own Auth does not start a background timer. Call the processor from the application's worker, scheduled job, or queue consumer:

```ts
const result = await auth.processWebhookDeliveries({ limit: 25 });

// result -> {
//   claimed: 3,
//   delivered: 2,
//   retried: 1,
//   failed: 0,
//   leaseLost: 0,
// }
```

Each call claims due deliveries with a lease so concurrent processors do not send the same queued attempt. The default limit is 10 and the maximum is 100.

Delivery is at least once. Endpoints must use the event ID as an idempotency key. Delivery order is not guaranteed.

## Payload

Every request contains a versioned JSON event:

```json
{
  "id": "evt_a1b2c3d4e5f6g7h8i9j0kA",
  "type": "user.signed_up",
  "version": 1,
  "createdAt": "2026-07-15T12:00:00.000Z",
  "data": {
    "actorUserId": "usr_a1b2c3",
    "targetUserId": "usr_a1b2c3",
    "organisationId": null,
    "apiKeyId": null,
    "details": {
      "provider": "password"
    }
  }
}
```

Event IDs use the stable format `evt_` followed by 22 base64url characters. The webhook event reuses the matching audit event ID.

Payload details are selected by Own Auth for each event type. Arbitrary audit metadata, passwords, session tokens, API-key values, one-time tokens, provider credentials, and request contents are not included.

Plugin audit events are not webhook events in this release.

## Verify a request

Import the receiver helper from `own-auth/webhooks`:

```ts
import { verifyOwnAuthWebhook } from "own-auth/webhooks";

const body = new Uint8Array(await request.arrayBuffer());

const event = await verifyOwnAuthWebhook({
  body,
  headers: request.headers,
  secrets: [process.env.OWN_AUTH_WEBHOOK_SECRET!],
  claimEvent: ({ eventId, expiresAt }) =>
    claimWebhookEvent({ eventId, expiresAt }),
});

switch (event.type) {
  case "user.signed_up":
    await provisionUser(event.data.targetUserId);
    break;
}
```

Pass the exact request bytes to `verifyOwnAuthWebhook`. Do not parse and recreate the JSON before verification.

The helper validates:

- `x-own-auth-webhook-id`
- `x-own-auth-webhook-timestamp`
- `x-own-auth-webhook-signature`
- the HMAC-SHA256 signature over the exact body
- the event ID and version in the payload
- a five-minute timestamp tolerance by default
- the receiver's atomic replay claim

`claimEvent` belongs to the receiving application. It must atomically return `true` only for the first claim of an event ID and retain that claim until at least `expiresAt`. A later claim must return `false`. Keep claims longer when the receiver needs idempotency across manual retries or extended delivery retention.

For a Postgres receiver, the receipt table can be:

```sql
create table processed_own_auth_webhooks (
  event_id text primary key,
  expires_at timestamptz not null
);
```

```ts
async function claimWebhookEvent(input: {
  eventId: string;
  expiresAt: Date;
}): Promise<boolean> {
  const result = await pool.query(
    `insert into processed_own_auth_webhooks (event_id, expires_at)
     values ($1, $2)
     on conflict (event_id) do nothing
     returning event_id`,
    [input.eventId, input.expiresAt],
  );

  return result.rowCount === 1;
}
```

Make the claim part of the receiver's durable processing path. Do not use a process-local `Set` in production.

### Timestamp tolerance

The default tolerance is five minutes. A receiver can choose a different positive duration:

```ts
const event = await verifyOwnAuthWebhook({
  body,
  headers: request.headers,
  secrets: [process.env.OWN_AUTH_WEBHOOK_SECRET!],
  toleranceMs: 10 * 60 * 1000,
  claimEvent,
});
```

Keep clocks synchronized. A larger tolerance also extends the replay window.

### Rotate a secret

Signatures are checked against every supplied secret. Put the current secret first and keep the previous secret while older sender instances may still use it during a rolling deployment:

```ts
const event = await verifyOwnAuthWebhook({
  body,
  headers: request.headers,
  secrets: [
    process.env.OWN_AUTH_WEBHOOK_SECRET!,
    process.env.OWN_AUTH_PREVIOUS_WEBHOOK_SECRET!,
  ],
  claimEvent,
});
```

## Retries

Own Auth sends once immediately, then schedules up to five retries:

| Retry | Earliest delay |
|---|---|
| 1 | 30 seconds |
| 2 | 2 minutes |
| 3 | 10 minutes |
| 4 | 1 hour |
| 5 | 6 hours |

Network errors, timeouts, HTTP `408`, `429`, and `5xx` responses are retryable. Other `3xx` and `4xx` responses fail permanently. Redirects are not followed.

`Retry-After` is honored for `429` and `503` responses when it asks Own Auth to wait longer than the normal delay, up to 24 hours. A retry becomes eligible after its scheduled time; the exact send time depends on when the application next runs the processor.

Requests time out after 10 seconds. Response bodies, response headers, and error messages are not stored.

## Inspect and retry deliveries

```ts
const failed = await auth.listWebhookDeliveries({
  endpointId: "application-events",
  status: "failed",
  limit: 50,
});
```

Each result includes delivery state and its complete attempt history. Internal lease tokens are never returned.

Retry a failed delivery:

```ts
await auth.retryWebhookDelivery({ deliveryId });
```

A manual retry starts a new retry cycle while preserving previous attempts and lifetime attempt numbers.

Delete completed delivery history older than a cutoff:

```ts
const deleted = await auth.cleanupWebhookDeliveries({
  olderThan: new Date("2026-01-01T00:00:00.000Z"),
});
```

Deleting a delivery also deletes its attempt rows. An event is removed after its final delivery is removed.

## Storage

Migration `008_webhooks` creates:

- `own_auth_webhook_events`
- `own_auth_webhook_deliveries`
- `own_auth_webhook_attempts`

Postgres and Cloudflare D1 store the outbox and attempt history durably. The in-memory adapter follows the same behavior for tests and local development, but queued deliveries disappear when the process exits.

Custom storage adapters used with `webhooks` must implement `WebhookCapableStorage`. Own Auth fails during construction when the configured adapter does not provide the complete capability.
