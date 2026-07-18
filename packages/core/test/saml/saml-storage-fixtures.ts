import type {
  Account,
  AuditEvent,
  OrganisationMember,
  User
} from "../../src/index.js";
import type { SamlIdentityCommit } from "../../src/saml-storage.js";
import type { SamlConnection, SamlTransaction } from "../../src/saml-types.js";

export const fixtureNow = new Date("2026-07-18T12:00:00.000Z");

export function samlConnection(): SamlConnection {
  return {
    id: "samlc_1",
    organisationId: "org_1",
    key: "saml_example",
    name: "Example Identity",
    idpEntityId: "https://idp.example.com/metadata",
    ssoUrl: "https://idp.example.com/sso",
    idpCertificates: ["certificate-one", "certificate-two"],
    attributeMapping: { subject: "nameId", email: "email", name: "name" },
    accountLinking: "explicit",
    jitProvisioningEnabled: true,
    jitDefaultRole: "member",
    requestSigningCertificate: null,
    requestSigningKeyCiphertext: null,
    requestSigningKeyNonce: null,
    requestSigningEncryptionKeyId: null,
    disabledAt: null,
    createdAt: fixtureNow,
    updatedAt: fixtureNow
  };
}

export function samlConnectionRow(dialect: "postgres" | "d1") {
  const connection = samlConnection();
  const date = dialect === "postgres" ? fixtureNow : fixtureNow.getTime();
  return {
    id: connection.id,
    organisation_id: connection.organisationId,
    connection_key: connection.key,
    name: connection.name,
    idp_entity_id: connection.idpEntityId,
    sso_url: connection.ssoUrl,
    idp_certificates: dialect === "postgres"
      ? connection.idpCertificates
      : JSON.stringify(connection.idpCertificates),
    attribute_mapping: dialect === "postgres"
      ? connection.attributeMapping
      : JSON.stringify(connection.attributeMapping),
    account_linking: connection.accountLinking,
    jit_provisioning_enabled: dialect === "postgres" ? true : 1,
    jit_default_role: connection.jitDefaultRole,
    request_signing_certificate: null,
    request_signing_key_ciphertext: null,
    request_signing_key_nonce: null,
    request_signing_encryption_key_id: null,
    disabled_at: null,
    created_at: date,
    updated_at: date
  };
}

export function samlTransaction(): SamlTransaction {
  return {
    id: "samt_1",
    connectionId: "samlc_1",
    requestIdHash: "request-hash",
    relayStateHash: "relay-hash",
    intent: "sign_in",
    userId: null,
    destination: "/dashboard",
    expiresAt: new Date(fixtureNow.getTime() + 300_000),
    consumedAt: null,
    createdAt: fixtureNow
  };
}

export function samlTransactionRow(dialect: "postgres" | "d1") {
  const transaction = samlTransaction();
  const date = (value: Date) => dialect === "postgres" ? value : value.getTime();
  return {
    id: transaction.id,
    connection_id: transaction.connectionId,
    request_id_hash: transaction.requestIdHash,
    relay_state_hash: transaction.relayStateHash,
    intent: transaction.intent,
    user_id: null,
    destination: transaction.destination,
    expires_at: date(transaction.expiresAt),
    consumed_at: null,
    created_at: date(transaction.createdAt)
  };
}

export function samlIdentityCommit(): SamlIdentityCommit {
  const user: User = {
    id: "usr_saml",
    email: "user@example.com",
    emailVerifiedAt: fixtureNow,
    phone: null,
    phoneVerifiedAt: null,
    passwordHash: null,
    name: "Example User",
    imageUrl: null,
    disabledAt: null,
    metadata: {},
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
    lastLoginAt: null
  };
  const account: Account = {
    id: "acct_saml",
    userId: user.id,
    provider: "saml.saml_example",
    providerAccountId: "subject-hash",
    providerEmail: user.email,
    providerPhone: null,
    createdAt: fixtureNow,
    updatedAt: fixtureNow
  };
  const membership: OrganisationMember = {
    id: "mem_saml",
    organisationId: "org_1",
    userId: user.id,
    role: "member",
    status: "active",
    joinedAt: fixtureNow,
    removedAt: null,
    createdAt: fixtureNow,
    updatedAt: fixtureNow
  };
  const auditEvent: AuditEvent = {
    id: "evt_saml",
    eventType: "saml.member_provisioned",
    actorUserId: user.id,
    targetUserId: user.id,
    organisationId: membership.organisationId,
    apiKeyId: null,
    ipAddress: null,
    userAgent: null,
    metadata: { connectionId: "samlc_1", role: "member" },
    createdAt: fixtureNow
  };
  return { user, account, membership, auditEvents: [auditEvent] };
}
