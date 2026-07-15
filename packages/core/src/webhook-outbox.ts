import { createId } from "./crypto.js";
import type { AuthEngineContext } from "./auth-engine-context.js";
import type { AuditEvent } from "./types.js";
import { createStoredWebhookEvent } from "./webhook-events.js";

export async function recordAuthEvent(
  ctx: AuthEngineContext,
  auditEvent: AuditEvent
): Promise<void> {
  const event = createStoredWebhookEvent(auditEvent);
  const endpoints = event && ctx.webhooks
    ? ctx.webhooks.endpoints.filter((endpoint) => endpoint.events.has(event.type))
    : [];

  if (!event || endpoints.length === 0) {
    await ctx.storage.createAuditEvent(auditEvent);
    return;
  }
  if (!ctx.webhookStorage) {
    throw new Error("WebhookCapableStorage is required when webhooks are configured");
  }

  await ctx.webhookStorage.recordAuditEventWithWebhooks(
    auditEvent,
    event,
    endpoints.map((endpoint) => ({
      id: createId("whd"),
      endpointId: endpoint.id,
      url: endpoint.url,
      createdAt: auditEvent.createdAt
    }))
  );
}
