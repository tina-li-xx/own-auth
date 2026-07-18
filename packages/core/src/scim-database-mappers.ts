import {
  booleanValue,
  dateValue,
  nullableDate,
  nullableString,
  numberValue,
  stringValue
} from "./database-row.js";
import type { DatabaseRow } from "./database-types.js";
import type {
  ScimAccountLinking,
  ScimConnection,
  ScimToken,
  ScimUser
} from "./scim-types.js";

export function mapScimConnection(row: DatabaseRow): ScimConnection {
  return {
    id: stringValue(row.id),
    organisationId: stringValue(row.organisation_id),
    key: stringValue(row.connection_key),
    name: stringValue(row.name),
    defaultRole: stringValue(row.default_role),
    accountLinking: stringValue(row.account_linking) as ScimAccountLinking,
    samlConnectionId: nullableString(row.saml_connection_id),
    disabledAt: nullableDate(row.disabled_at),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at)
  };
}

export function mapScimToken(row: DatabaseRow): ScimToken {
  return {
    id: stringValue(row.id),
    connectionId: stringValue(row.connection_id),
    name: stringValue(row.name),
    prefix: stringValue(row.prefix),
    tokenHash: stringValue(row.token_hash),
    expiresAt: nullableDate(row.expires_at),
    lastUsedAt: nullableDate(row.last_used_at),
    revokedAt: nullableDate(row.revoked_at),
    createdAt: dateValue(row.created_at)
  };
}

export function mapScimUser(row: DatabaseRow): ScimUser {
  return {
    id: stringValue(row.id),
    connectionId: stringValue(row.connection_id),
    userId: stringValue(row.user_id),
    membershipId: stringValue(row.membership_id),
    externalId: nullableString(row.external_id),
    userName: stringValue(row.user_name),
    normalizedUserName: stringValue(row.normalized_user_name),
    email: nullableString(row.email),
    normalizedEmail: nullableString(row.normalized_email),
    displayName: nullableString(row.display_name),
    givenName: nullableString(row.given_name),
    familyName: nullableString(row.family_name),
    active: booleanValue(row.active),
    version: numberValue(row.version),
    deletedAt: nullableDate(row.deleted_at),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at)
  };
}
