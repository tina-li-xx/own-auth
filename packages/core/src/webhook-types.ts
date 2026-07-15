import type { CoreAuditEventType, JsonRecord } from "./types.js";

export type WebhookEventType = CoreAuditEventType;
export type WebhookDeliveryStatus = "delivered" | "failed" | "pending" | "processing";
export type WebhookAttemptOutcome = "delivered" | "failed" | "retry_scheduled";
export type WebhookAttemptErrorCode =
  | "endpoint_not_configured"
  | "http_permanent"
  | "http_retryable"
  | "network_error"
  | "timeout";

export interface WebhookEventData {
  actorUserId: string | null;
  targetUserId: string | null;
  organisationId: string | null;
  apiKeyId: string | null;
  details: JsonRecord;
}

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  version: 1;
  createdAt: string;
  data: WebhookEventData;
}

export interface WebhookEndpointOptions {
  id: string;
  url: string | URL;
  secret: string;
  events: readonly WebhookEventType[];
}

export interface WebhookOptions {
  endpoints: readonly WebhookEndpointOptions[];
  fetch?: typeof fetch;
}

export interface StoredWebhookEvent {
  id: string;
  type: WebhookEventType;
  version: 1;
  payload: string;
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  eventId: string;
  endpointId: string;
  url: string;
  status: WebhookDeliveryStatus;
  attemptsInCycle: number;
  totalAttempts: number;
  nextAttemptAt: Date;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  lastStatusCode: number | null;
  lastErrorCode: WebhookAttemptErrorCode | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookAttempt {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  startedAt: Date;
  finishedAt: Date;
  outcome: WebhookAttemptOutcome;
  statusCode: number | null;
  errorCode: WebhookAttemptErrorCode | null;
  nextRetryAt: Date | null;
}

export type WebhookDeliveryDetails = Omit<WebhookDelivery, "leaseToken"> & {
  eventType: WebhookEventType;
  attempts: WebhookAttempt[];
};

export interface ProcessWebhookDeliveriesInput {
  limit?: number;
}

export interface ProcessWebhookDeliveriesResult {
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
  leaseLost: number;
}

export interface ListWebhookDeliveriesInput {
  endpointId?: string;
  status?: WebhookDeliveryStatus;
  limit?: number;
}

export interface RetryWebhookDeliveryInput {
  deliveryId: string;
}

export interface CleanupWebhookDeliveriesInput {
  olderThan: Date;
}
