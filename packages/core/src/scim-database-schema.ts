import { databaseColumnList, type EntityColumnMap } from "./database-types.js";
import type { ScimConnection, ScimToken, ScimUser } from "./scim-types.js";

export const scimConnectionColumns: EntityColumnMap<ScimConnection> = {
  id: "id",
  organisationId: "organisation_id",
  key: "connection_key",
  name: "name",
  defaultRole: "default_role",
  accountLinking: "account_linking",
  samlConnectionId: "saml_connection_id",
  disabledAt: "disabled_at",
  createdAt: "created_at",
  updatedAt: "updated_at"
};

export const scimTokenColumns: EntityColumnMap<ScimToken> = {
  id: "id",
  connectionId: "connection_id",
  name: "name",
  prefix: "prefix",
  tokenHash: "token_hash",
  expiresAt: "expires_at",
  lastUsedAt: "last_used_at",
  revokedAt: "revoked_at",
  createdAt: "created_at"
};

export const scimUserColumns: EntityColumnMap<ScimUser> = {
  id: "id",
  connectionId: "connection_id",
  userId: "user_id",
  membershipId: "membership_id",
  externalId: "external_id",
  userName: "user_name",
  normalizedUserName: "normalized_user_name",
  email: "email",
  normalizedEmail: "normalized_email",
  displayName: "display_name",
  givenName: "given_name",
  familyName: "family_name",
  active: "active",
  version: "version",
  deletedAt: "deleted_at",
  createdAt: "created_at",
  updatedAt: "updated_at"
};

export const scimConnectionReturning = databaseColumnList(scimConnectionColumns);
export const scimTokenReturning = databaseColumnList(scimTokenColumns);
export const scimUserReturning = databaseColumnList(scimUserColumns);
