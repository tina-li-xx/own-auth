import type { JsonSchema } from "./contract-types.js";

export const stringSchema = (format?: string): JsonSchema => ({
  type: "string",
  minLength: 1,
  ...(format ? { format } : {})
});

export const nullableStringSchema: JsonSchema = {
  anyOf: [{ type: "string" }, { type: "null" }]
};

export const openObjectSchema: JsonSchema = { type: "object", additionalProperties: true };

export const objectSchema = (
  properties: Record<string, JsonSchema>,
  required: readonly string[] = [],
  additionalProperties = false
): JsonSchema => ({ type: "object", properties, required, additionalProperties });

export const publicAuthUserSchema = objectSchema(
  {
    id: stringSchema(),
    email: nullableStringSchema,
    emailVerifiedAt: nullableStringSchema,
    phone: nullableStringSchema,
    phoneVerifiedAt: nullableStringSchema,
    name: nullableStringSchema,
    imageUrl: nullableStringSchema,
    metadata: openObjectSchema,
    createdAt: stringSchema("date-time"),
    updatedAt: stringSchema("date-time"),
    lastLoginAt: nullableStringSchema
  },
  ["id", "email", "emailVerifiedAt", "phone", "phoneVerifiedAt", "name", "imageUrl", "metadata", "createdAt", "updatedAt", "lastLoginAt"]
);

export const publicAuthSessionSchema = objectSchema(
  {
    id: stringSchema(),
    userId: stringSchema(),
    createdAt: stringSchema("date-time"),
    lastActiveAt: stringSchema("date-time"),
    expiresAt: stringSchema("date-time"),
    idleExpiresAt: stringSchema("date-time"),
    ipAddress: nullableStringSchema,
    userAgent: nullableStringSchema,
    authenticationMethods: { type: "array", items: stringSchema() },
    assuranceLevel: { type: "string", enum: ["aal1", "aal2"] },
    authenticatedAt: stringSchema("date-time")
  },
  ["id", "userId", "createdAt", "lastActiveAt", "expiresAt", "idleExpiresAt", "ipAddress", "userAgent", "authenticationMethods", "assuranceLevel", "authenticatedAt"]
);

export const authSessionSchema = objectSchema(
  {
    status: { const: "complete" },
    user: publicAuthUserSchema,
    session: publicAuthSessionSchema
  },
  ["status", "user", "session"]
);

export const mfaRequiredSchema = objectSchema(
  {
    status: { const: "mfa_required" },
    methods: { type: "array", items: { type: "string", enum: ["totp", "recovery_code", "passkey"] } },
    expiresAt: stringSchema("date-time")
  },
  ["status", "methods", "expiresAt"]
);

export const signInSchema: JsonSchema = { anyOf: [authSessionSchema, mfaRequiredSchema] };

export const publicPasskeySchema = objectSchema(
  {
    id: stringSchema(),
    name: stringSchema(),
    discoverable: { type: "boolean" },
    deviceType: { type: "string", enum: ["singleDevice", "multiDevice"] },
    backedUp: { type: "boolean" },
    createdAt: stringSchema("date-time"),
    lastUsedAt: nullableStringSchema
  },
  ["id", "name", "discoverable", "deviceType", "backedUp", "createdAt", "lastUsedAt"]
);

export const publicAdministrationUserSchema = objectSchema(
  {
    ...(publicAuthUserSchema.properties as Record<string, JsonSchema>),
    disabledAt: nullableStringSchema
  },
  [
    ...(publicAuthUserSchema.required as string[]),
    "disabledAt"
  ]
);

export const publicAdministrationSessionSchema = objectSchema(
  {
    ...(publicAuthSessionSchema.properties as Record<string, JsonSchema>),
    revokedAt: nullableStringSchema,
    revokeReason: nullableStringSchema,
    effectiveStatus: {
      type: "string",
      enum: ["active", "disabled_user", "expired", "revoked"]
    }
  },
  [
    ...(publicAuthSessionSchema.required as string[]),
    "revokedAt",
    "revokeReason",
    "effectiveStatus"
  ]
);

export const publicAdministrationAuditEventSchema = objectSchema(
  {
    id: stringSchema(),
    eventType: stringSchema(),
    actorUserId: nullableStringSchema,
    targetUserId: nullableStringSchema,
    organisationId: nullableStringSchema,
    apiKeyId: nullableStringSchema,
    ipAddress: nullableStringSchema,
    userAgent: nullableStringSchema,
    metadata: openObjectSchema,
    createdAt: stringSchema("date-time")
  },
  [
    "id",
    "eventType",
    "actorUserId",
    "targetUserId",
    "organisationId",
    "apiKeyId",
    "ipAddress",
    "userAgent",
    "metadata",
    "createdAt"
  ]
);
