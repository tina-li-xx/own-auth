import type { ScimStorage } from "../packages/core/src/scim-storage.js";
import type { AuthStorage } from "../packages/core/src/storage.js";

export async function assertScimVersionRace(
  authStorage: AuthStorage,
  storage: readonly [ScimStorage, ScimStorage]
): Promise<void> {
  const suffix = crypto.randomUUID();
  const now = new Date();
  const ownerId = `usr_scim_owner_${suffix}`;
  const organisationId = `org_scim_${suffix}`;
  const connectionId = `scimc_${suffix}`;
  const userId = `usr_scim_${suffix}`;
  const membershipId = `mem_scim_${suffix}`;
  const scimUserId = `scimu_${suffix}`;

  await authStorage.createUser({
    id: ownerId,
    email: `scim-owner-${suffix}@example.com`,
    emailVerifiedAt: now,
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: null,
    name: null,
    imageUrl: null,
    disabledAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  });
  await authStorage.createOrganisation({
    id: organisationId,
    name: "SCIM version race",
    slug: `scim-version-race-${suffix}`,
    ownerUserId: ownerId,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    disabledAt: null
  });
  await storage[0].createConnection({
    id: connectionId,
    organisationId,
    key: `scim_${suffix}`,
    name: "Race identity provider",
    defaultRole: "member",
    accountLinking: "explicit",
    samlConnectionId: null,
    disabledAt: null,
    createdAt: now,
    updatedAt: now
  });
  await storage[0].commitProvision({
    user: {
      id: userId,
      email: `scim-user-${suffix}@example.com`,
      emailVerifiedAt: null,
      phone: null,
      phoneVerifiedAt: null,
      passwordHash: null,
      name: "SCIM race user",
      imageUrl: null,
      disabledAt: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null
    },
    membership: {
      id: membershipId,
      organisationId,
      userId,
      role: "member",
      status: "active",
      joinedAt: now,
      removedAt: null,
      createdAt: now,
      updatedAt: now
    },
    scimUser: {
      id: scimUserId,
      connectionId,
      userId,
      membershipId,
      externalId: `external-${suffix}`,
      userName: `scim-user-${suffix}@example.com`,
      normalizedUserName: `scim-user-${suffix}@example.com`,
      email: `scim-user-${suffix}@example.com`,
      normalizedEmail: `scim-user-${suffix}@example.com`,
      displayName: "SCIM race user",
      givenName: null,
      familyName: null,
      active: true,
      version: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    },
    auditEvents: [{
      id: `evt_scim_${suffix}`,
      eventType: "scim.user_created",
      actorUserId: null,
      targetUserId: userId,
      organisationId,
      apiKeyId: null,
      ipAddress: null,
      userAgent: null,
      metadata: { connectionId, scimUserId },
      createdAt: now
    }]
  });

  const results = await Promise.all([
    storage[0].mutateUser({
      id: scimUserId,
      expectedVersion: 1,
      patch: { displayName: "First update", updatedAt: now }
    }),
    storage[1].mutateUser({
      id: scimUserId,
      expectedVersion: 1,
      patch: { displayName: "Second update", updatedAt: now }
    })
  ]);
  const stored = await storage[0].getUserById(scimUserId);
  if (results.filter(Boolean).length !== 1 || stored?.version !== 2) {
    throw new Error("D1 accepted more than one SCIM update for the same resource version");
  }
}
