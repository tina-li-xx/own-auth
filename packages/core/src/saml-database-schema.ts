import type { EntityColumnMap } from "./database-types.js";
import { databaseColumnList } from "./database-types.js";
import type {
  SamlAssertionReplay,
  SamlConnection,
  SamlTransaction
} from "./saml-types.js";

export const samlConnectionColumns: EntityColumnMap<SamlConnection> = {
  id: "id",
  organisationId: "organisation_id",
  key: "connection_key",
  name: "name",
  idpEntityId: "idp_entity_id",
  ssoUrl: "sso_url",
  idpCertificates: "idp_certificates",
  attributeMapping: "attribute_mapping",
  accountLinking: "account_linking",
  jitProvisioningEnabled: "jit_provisioning_enabled",
  jitDefaultRole: "jit_default_role",
  requestSigningCertificate: "request_signing_certificate",
  requestSigningKeyCiphertext: "request_signing_key_ciphertext",
  requestSigningKeyNonce: "request_signing_key_nonce",
  requestSigningEncryptionKeyId: "request_signing_encryption_key_id",
  disabledAt: "disabled_at",
  createdAt: "created_at",
  updatedAt: "updated_at"
};

export const samlTransactionColumns: EntityColumnMap<SamlTransaction> = {
  id: "id",
  connectionId: "connection_id",
  requestIdHash: "request_id_hash",
  relayStateHash: "relay_state_hash",
  intent: "intent",
  userId: "user_id",
  destination: "destination",
  expiresAt: "expires_at",
  consumedAt: "consumed_at",
  createdAt: "created_at"
};

export const samlAssertionReplayColumns: EntityColumnMap<SamlAssertionReplay> = {
  assertionHash: "assertion_hash",
  connectionId: "connection_id",
  consumedAt: "consumed_at",
  expiresAt: "expires_at"
};

export const samlConnectionReturning = databaseColumnList(samlConnectionColumns);
export const samlTransactionReturning = databaseColumnList(samlTransactionColumns);
