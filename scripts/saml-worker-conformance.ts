import type { SamlStorage } from "../packages/core/src/saml-storage.js";
import type { AuthStorage } from "../packages/core/src/storage.js";

export async function assertSamlResponseRace(
  authStorage: AuthStorage,
  storage: readonly [SamlStorage, SamlStorage]
): Promise<void> {
  const suffix = crypto.randomUUID();
  const now = new Date();
  const userId = `usr_saml_${suffix}`;
  const organisationId = `org_saml_${suffix}`;
  const connectionId = `samlc_${suffix}`;

  await authStorage.createUser({
    id: userId,
    email: `saml-race-${suffix}@example.com`,
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
    name: "SAML race",
    slug: `saml-race-${suffix}`,
    ownerUserId: userId,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    disabledAt: null
  });
  await storage[0].createConnection({
    id: connectionId,
    organisationId,
    key: `saml_${suffix}`,
    name: "Race identity",
    idpEntityId: `https://idp.example.com/${suffix}`,
    ssoUrl: "https://idp.example.com/sso",
    idpCertificates: ["certificate"],
    attributeMapping: { email: "email" },
    accountLinking: "explicit",
    jitProvisioningEnabled: false,
    jitDefaultRole: "member",
    requestSigningCertificate: null,
    requestSigningKeyCiphertext: null,
    requestSigningKeyNonce: null,
    requestSigningEncryptionKeyId: null,
    disabledAt: null,
    createdAt: now,
    updatedAt: now
  });
  await storage[0].createTransaction({
    id: `samt_${suffix}`,
    connectionId,
    requestIdHash: `request_${suffix}`,
    relayStateHash: `relay_${suffix}`,
    intent: "sign_in",
    userId: null,
    destination: null,
    expiresAt: new Date(now.getTime() + 300_000),
    consumedAt: null,
    createdAt: now
  });
  const input = {
    relayStateHash: `relay_${suffix}`,
    requestIdHash: `request_${suffix}`,
    assertion: {
      assertionHash: `assertion_${suffix}`,
      connectionId,
      consumedAt: now,
      expiresAt: new Date(now.getTime() + 420_000)
    },
    consumedAt: now
  };
  const results = await Promise.all([
    storage[0].consumeResponse(input),
    storage[1].consumeResponse(input)
  ]);
  if (results.filter(Boolean).length !== 1) {
    throw new Error("D1 accepted the same SAML response more than once");
  }
}
