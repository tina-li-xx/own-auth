import { databaseColumnList, type EntityColumnMap } from "./database-types.js";
import type {
  StoredWebhookEvent,
  WebhookAttempt,
  WebhookDelivery
} from "./webhook-types.js";

export const webhookEventColumns: EntityColumnMap<StoredWebhookEvent> = {
  id: "id",
  type: "event_type",
  version: "version",
  payload: "payload",
  createdAt: "created_at"
};

export const webhookDeliveryColumns: EntityColumnMap<WebhookDelivery> = {
  id: "id",
  eventId: "event_id",
  endpointId: "endpoint_id",
  url: "endpoint_url",
  status: "status",
  attemptsInCycle: "attempts_in_cycle",
  totalAttempts: "total_attempts",
  nextAttemptAt: "next_attempt_at",
  leaseToken: "lease_token",
  leaseExpiresAt: "lease_expires_at",
  deliveredAt: "delivered_at",
  failedAt: "failed_at",
  lastStatusCode: "last_status_code",
  lastErrorCode: "last_error_code",
  createdAt: "created_at",
  updatedAt: "updated_at"
};

export const webhookAttemptColumns: EntityColumnMap<WebhookAttempt> = {
  id: "id",
  deliveryId: "delivery_id",
  attemptNumber: "attempt_number",
  startedAt: "started_at",
  finishedAt: "finished_at",
  outcome: "outcome",
  statusCode: "status_code",
  errorCode: "error_code",
  nextRetryAt: "next_retry_at"
};

export const webhookEventReturning = databaseColumnList(webhookEventColumns);
export const webhookDeliveryReturning = databaseColumnList(webhookDeliveryColumns);
export const webhookAttemptReturning = databaseColumnList(webhookAttemptColumns);

export function webhookDeliverySelection(alias: string): string {
  return Object.values(webhookDeliveryColumns)
    .map((column) => `${alias}.${column}`)
    .join(", ");
}
