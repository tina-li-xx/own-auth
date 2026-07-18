import {
  booleanValue,
  dateValue,
  jsonRecord,
  nullableDate,
  nullableString,
  stringArray,
  stringValue
} from "./database-row.js";
import type { DatabaseRow } from "./database-types.js";
import type {
  SamlAccountLinking,
  SamlAttributeMapping,
  SamlConnection,
  SamlIntent,
  SamlTransaction
} from "./saml-types.js";

export function mapSamlConnection(row: DatabaseRow): SamlConnection {
  return {
    id: stringValue(row.id),
    organisationId: stringValue(row.organisation_id),
    key: stringValue(row.connection_key),
    name: stringValue(row.name),
    idpEntityId: stringValue(row.idp_entity_id),
    ssoUrl: stringValue(row.sso_url),
    idpCertificates: stringArray(row.idp_certificates),
    attributeMapping: jsonRecord(row.attribute_mapping) as unknown as SamlAttributeMapping,
    accountLinking: stringValue(row.account_linking) as SamlAccountLinking,
    jitProvisioningEnabled: booleanValue(row.jit_provisioning_enabled),
    jitDefaultRole: stringValue(row.jit_default_role),
    requestSigningCertificate: nullableString(row.request_signing_certificate),
    requestSigningKeyCiphertext: nullableString(row.request_signing_key_ciphertext),
    requestSigningKeyNonce: nullableString(row.request_signing_key_nonce),
    requestSigningEncryptionKeyId: nullableString(row.request_signing_encryption_key_id),
    disabledAt: nullableDate(row.disabled_at),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at)
  };
}

export function mapSamlTransaction(row: DatabaseRow): SamlTransaction {
  return {
    id: stringValue(row.id),
    connectionId: stringValue(row.connection_id),
    requestIdHash: stringValue(row.request_id_hash),
    relayStateHash: stringValue(row.relay_state_hash),
    intent: stringValue(row.intent) as SamlIntent,
    userId: nullableString(row.user_id),
    destination: nullableString(row.destination),
    expiresAt: dateValue(row.expires_at),
    consumedAt: nullableDate(row.consumed_at),
    createdAt: dateValue(row.created_at)
  };
}
