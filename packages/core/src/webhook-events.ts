import { coreAuditEventTypes, type AuditEvent, type CoreAuditEventType, type JsonRecord } from "./types.js";
import type { StoredWebhookEvent, WebhookEvent } from "./webhook-types.js";

const coreEventTypes = new Set<string>(coreAuditEventTypes);
const detailKeys: Partial<Record<CoreAuditEventType, readonly string[]>> = {
  "user.signed_up": ["provider"],
  "user.signed_in": ["method", "assuranceLevel"],
  "external_provider.linked": ["provider"],
  "external_provider.unlinked": ["provider"],
  "oauth.started": ["provider", "intent", "mode", "flow"],
  "oauth.signed_in": ["provider", "mode", "flow"],
  "oauth.failed": ["provider", "error", "flow"],
  "oauth.credential_stored": ["provider"],
  "oauth.credential_refreshed": ["provider"],
  "oauth.credential_revoked": ["provider"],
  "mfa.challenge_succeeded": ["method"],
  "mfa.recovery_code_used": ["method"],
  "session.elevated": ["assuranceLevel", "method"],
  "passkey.registered": ["passkeyId", "discoverable"],
  "passkey.authenticated": ["passkeyId", "purpose"],
  "passkey.renamed": ["passkeyId"],
  "passkey.revoked": ["passkeyId"],
  "session.created": ["sessionId"],
  "session.revoked": ["reason", "sessionId"],
  "session.revoked_other": ["reason", "revoked"],
  "session.revoked_all": ["reason", "revoked"],
  "sms_otp.sent": ["purpose", "otpId"],
  "sms_otp.verified": ["purpose"],
  "api_key.created": ["name", "scopes"],
  "api_key.used": ["requiredScopes"],
  "organisation.created": ["name", "slug"],
  "organisation.deleted": [
    "organisationId",
    "name",
    "slug",
    "membersRemoved",
    "apiKeysRemoved",
    "invitationsRemoved"
  ],
  "organisation.updated": ["name", "slug", "updatedAt"],
  "member.invited": ["email", "role", "invitationId"],
  "invite.accepted": ["invitationId"],
  "invite.revoked": ["invitationId", "email"],
  "member.removed": ["memberId", "role", "ownershipTransferredTo"],
  "member.role_changed": ["previousRole", "role", "ownershipTransferredTo"]
};

export function isWebhookEventType(value: string): value is CoreAuditEventType {
  return coreEventTypes.has(value);
}

export function createStoredWebhookEvent(auditEvent: AuditEvent): StoredWebhookEvent | null {
  if (!isWebhookEventType(auditEvent.eventType)) return null;

  const event: WebhookEvent = {
    id: auditEvent.id,
    type: auditEvent.eventType,
    version: 1,
    createdAt: auditEvent.createdAt.toISOString(),
    data: {
      actorUserId: auditEvent.actorUserId,
      targetUserId: auditEvent.targetUserId,
      organisationId: auditEvent.organisationId,
      apiKeyId: auditEvent.apiKeyId,
      details: safeDetails(auditEvent.eventType, auditEvent.metadata)
    }
  };

  return {
    id: event.id,
    type: event.type,
    version: event.version,
    payload: JSON.stringify(event),
    createdAt: auditEvent.createdAt
  };
}

function safeDetails(type: CoreAuditEventType, metadata: JsonRecord): JsonRecord {
  const details: JsonRecord = {};
  for (const key of detailKeys[type] ?? []) {
    const value = safeDetailValue(metadata[key]);
    if (value !== undefined) details[key] = value;
  }
  return details;
}

function safeDetailValue(value: unknown): string | number | boolean | null | string[] | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }
  return undefined;
}
