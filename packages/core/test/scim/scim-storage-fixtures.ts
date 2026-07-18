import type {
  AuditEvent,
  OrganisationMember,
  User
} from "../../src/index.js";
import type {
  ScimConnection,
  ScimProvisionCommit,
  ScimToken,
  ScimUser
} from "../../src/scim-types.js";

export const scimFixtureNow = new Date("2026-07-18T12:00:00.000Z");

export function scimConnection(): ScimConnection {
  return {
    id: "scimc_1",
    organisationId: "org_1",
    key: "scim_example",
    name: "Example provisioning",
    defaultRole: "member",
    accountLinking: "explicit",
    samlConnectionId: "samlc_1",
    disabledAt: null,
    createdAt: scimFixtureNow,
    updatedAt: scimFixtureNow
  };
}

export function scimConnectionRow(dialect: "postgres" | "d1") {
  const value = scimConnection();
  const date = dialect === "postgres" ? scimFixtureNow : scimFixtureNow.getTime();
  return {
    id: value.id,
    organisation_id: value.organisationId,
    connection_key: value.key,
    name: value.name,
    default_role: value.defaultRole,
    account_linking: value.accountLinking,
    saml_connection_id: value.samlConnectionId,
    disabled_at: null,
    created_at: date,
    updated_at: date
  };
}

export function scimToken(): ScimToken {
  return {
    id: "scimt_1",
    connectionId: "scimc_1",
    name: "Identity provider",
    prefix: "oa_scim_visible",
    tokenHash: "stored-token-hash",
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: scimFixtureNow
  };
}

export function scimUser(id = "scimu_1"): ScimUser {
  return {
    id,
    connectionId: "scimc_1",
    userId: `usr_${id}`,
    membershipId: `mem_${id}`,
    externalId: `external_${id}`,
    userName: `${id}@example.com`,
    normalizedUserName: `${id}@example.com`,
    email: `${id}@example.com`,
    normalizedEmail: `${id}@example.com`,
    displayName: "SCIM User",
    givenName: "SCIM",
    familyName: "User",
    active: true,
    version: 1,
    deletedAt: null,
    createdAt: scimFixtureNow,
    updatedAt: scimFixtureNow
  };
}

export function scimUserRow(dialect: "postgres" | "d1", id = "scimu_1") {
  const value = scimUser(id);
  const date = dialect === "postgres" ? scimFixtureNow : scimFixtureNow.getTime();
  return {
    id: value.id,
    connection_id: value.connectionId,
    user_id: value.userId,
    membership_id: value.membershipId,
    external_id: value.externalId,
    user_name: value.userName,
    normalized_user_name: value.normalizedUserName,
    email: value.email,
    normalized_email: value.normalizedEmail,
    display_name: value.displayName,
    given_name: value.givenName,
    family_name: value.familyName,
    active: dialect === "postgres" ? true : 1,
    version: value.version,
    deleted_at: null,
    created_at: date,
    updated_at: date
  };
}

export function scimProvisionCommit(): ScimProvisionCommit {
  const user = fixtureUser();
  const membership: OrganisationMember<string> = {
    id: "mem_scimu_1",
    organisationId: "org_1",
    userId: user.id,
    role: "member",
    status: "active",
    joinedAt: scimFixtureNow,
    removedAt: null,
    createdAt: scimFixtureNow,
    updatedAt: scimFixtureNow
  };
  return {
    user,
    membership,
    scimUser: scimUser(),
    auditEvents: [fixtureAuditEvent()]
  };
}

export function fixtureAuditEvent(): AuditEvent {
  return {
    id: "evt_scim_1",
    eventType: "scim.user_created",
    actorUserId: null,
    targetUserId: "usr_scimu_1",
    organisationId: "org_1",
    apiKeyId: null,
    ipAddress: null,
    userAgent: null,
    metadata: { connectionId: "scimc_1", scimUserId: "scimu_1" },
    createdAt: scimFixtureNow
  };
}

function fixtureUser(): User {
  return {
    id: "usr_scimu_1",
    email: "scimu_1@example.com",
    emailVerifiedAt: null,
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: null,
    name: "SCIM User",
    imageUrl: null,
    disabledAt: null,
    metadata: {},
    createdAt: scimFixtureNow,
    updatedAt: scimFixtureNow,
    lastLoginAt: null
  };
}
