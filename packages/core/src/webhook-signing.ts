import { decodeBase64Url, encodeBase64Url } from "./encoding.js";
import { AuthError } from "./errors.js";
import { isRecord } from "./value-guards.js";
import { isWebhookEventType } from "./webhook-events.js";
import type { WebhookEvent } from "./webhook-types.js";

export const webhookIdHeader = "x-own-auth-webhook-id";
export const webhookTimestampHeader = "x-own-auth-webhook-timestamp";
export const webhookSignatureHeader = "x-own-auth-webhook-signature";
export const defaultWebhookTimestampToleranceMs = 5 * 60 * 1_000;

export interface VerifyOwnAuthWebhookInput {
  body: string | Uint8Array;
  headers: Headers | Record<string, string | undefined>;
  secrets: readonly string[];
  claimEvent(input: { eventId: string; expiresAt: Date }): Promise<boolean>;
  toleranceMs?: number;
  now?: Date;
}

export async function verifyOwnAuthWebhook(
  input: VerifyOwnAuthWebhookInput
): Promise<WebhookEvent> {
  const eventId = requireHeader(input.headers, webhookIdHeader);
  const timestamp = requireHeader(input.headers, webhookTimestampHeader);
  const signature = requireHeader(input.headers, webhookSignatureHeader);
  const toleranceMs = positiveTolerance(input.toleranceMs ?? defaultWebhookTimestampToleranceMs);
  const timestampMs = parseTimestamp(timestamp);
  const now = input.now ?? new Date();

  if (!/^evt_[A-Za-z0-9_-]{22}$/u.test(eventId)) {
    throw new AuthError("webhook_signature_invalid", "Webhook signature is invalid", 401);
  }
  if (Math.abs(now.getTime() - timestampMs) > toleranceMs) {
    throw new AuthError("webhook_timestamp_invalid", "Webhook timestamp is invalid", 401);
  }
  if (input.secrets.length === 0 || input.secrets.some((secret) => utf8(secret).byteLength < 32)) {
    throw new Error("Webhook verification requires secrets of at least 32 bytes");
  }

  const body = bodyBytes(input.body);
  const valid = await verifySignature({
    body,
    eventId,
    timestamp,
    signature,
    secrets: input.secrets
  });
  if (!valid) {
    throw new AuthError("webhook_signature_invalid", "Webhook signature is invalid", 401);
  }

  const event = parseWebhookEvent(body, eventId);
  const claimed = await input.claimEvent({
    eventId,
    expiresAt: new Date(timestampMs + toleranceMs)
  });
  if (!claimed) {
    throw new AuthError("webhook_replayed", "Webhook event has already been processed", 409);
  }
  return event;
}

export async function createWebhookSignature(input: {
  body: string | Uint8Array;
  eventId: string;
  timestamp: string;
  secret: string;
}): Promise<string> {
  const key = await importHmacKey(input.secret, "sign");
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    signatureBytes(input.eventId, input.timestamp, bodyBytes(input.body))
  );
  return `v1=${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifySignature(input: {
  body: Uint8Array;
  eventId: string;
  timestamp: string;
  signature: string;
  secrets: readonly string[];
}): Promise<boolean> {
  const encoded = input.signature.match(/^v1=([A-Za-z0-9_-]+)$/u)?.[1];
  if (!encoded) return false;

  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(encoded);
  } catch {
    return false;
  }
  const data = signatureBytes(input.eventId, input.timestamp, input.body);
  const matches = await Promise.all(input.secrets.map(async (secret) => {
    const key = await importHmacKey(secret, "verify");
    return crypto.subtle.verify("HMAC", key, signature, data);
  }));
  return matches.some(Boolean);
}

async function importHmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    utf8(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

function signatureBytes(eventId: string, timestamp: string, body: Uint8Array): Uint8Array {
  const prefix = utf8(`v1.${eventId}.${timestamp}.`);
  const bytes = new Uint8Array(prefix.byteLength + body.byteLength);
  bytes.set(prefix);
  bytes.set(body, prefix.byteLength);
  return bytes;
}

function parseWebhookEvent(body: Uint8Array, expectedId: string): WebhookEvent {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AuthError("webhook_signature_invalid", "Webhook payload is invalid", 401);
  }
  if (
    !isRecord(value) ||
    value.id !== expectedId ||
    value.version !== 1 ||
    typeof value.type !== "string" ||
    !isWebhookEventType(value.type) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !isRecord(value.data) ||
    !isNullableString(value.data.actorUserId) ||
    !isNullableString(value.data.targetUserId) ||
    !isNullableString(value.data.organisationId) ||
    !isNullableString(value.data.apiKeyId) ||
    !isRecord(value.data.details)
  ) {
    throw new AuthError("webhook_signature_invalid", "Webhook payload is invalid", 401);
  }
  return value as unknown as WebhookEvent;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function requireHeader(
  headers: VerifyOwnAuthWebhookInput["headers"],
  name: string
): string {
  const value = headers instanceof Headers
    ? headers.get(name)
    : Object.entries(headers).find(([key]) => key.toLowerCase() === name)?.[1];
  if (!value) {
    throw new AuthError("webhook_signature_invalid", "Webhook signature is invalid", 401);
  }
  return value;
}

function parseTimestamp(value: string): number {
  if (!/^\d{10,11}$/u.test(value)) {
    throw new AuthError("webhook_timestamp_invalid", "Webhook timestamp is invalid", 401);
  }
  const seconds = Number(value);
  const timestamp = seconds * 1_000;
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(timestamp)) {
    throw new AuthError("webhook_timestamp_invalid", "Webhook timestamp is invalid", 401);
  }
  return timestamp;
}

function positiveTolerance(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Webhook timestamp tolerance must be a positive integer");
  }
  return value;
}

function bodyBytes(body: string | Uint8Array): Uint8Array {
  return typeof body === "string" ? utf8(body) : body;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
