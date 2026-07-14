import type {
  MfaChallenge,
  OAuthCredential,
  OAuthTransaction,
  PasskeyCredential,
  TotpFactor,
  WebAuthnChallenge
} from "../identity-types.js";
import type { ColumnMap } from "./postgres-types.js";

export const oauthTransactionColumns: ColumnMap<OAuthTransaction> = {
  id: "id",
  provider: "provider",
  flowKind: "flow_kind",
  intent: "intent",
  stateHash: "state_hash",
  destination: "destination",
  interactionMode: "interaction_mode",
  openerOrigin: "opener_origin",
  userId: "user_id",
  expiresAt: "expires_at",
  consumedAt: "consumed_at",
  createdAt: "created_at"
};

export const oauthCredentialColumns: ColumnMap<OAuthCredential> = {
  id: "id",
  accountId: "account_id",
  provider: "provider",
  ciphertext: "ciphertext",
  nonce: "nonce",
  encryptionKeyId: "encryption_key_id",
  scopes: "scopes",
  createdAt: "created_at",
  updatedAt: "updated_at",
  rotatedAt: "rotated_at"
};

export const totpFactorColumns: ColumnMap<TotpFactor> = {
  id: "id",
  userId: "user_id",
  status: "status",
  ciphertext: "ciphertext",
  nonce: "nonce",
  encryptionKeyId: "encryption_key_id",
  lastUsedTimestep: "last_used_timestep",
  createdAt: "created_at",
  updatedAt: "updated_at",
  disabledAt: "disabled_at"
};

export const mfaChallengeColumns: ColumnMap<MfaChallenge> = {
  id: "id",
  userId: "user_id",
  tokenHash: "token_hash",
  primaryMethod: "primary_method",
  methods: "methods",
  attempts: "attempts",
  maxAttempts: "max_attempts",
  expiresAt: "expires_at",
  consumedAt: "consumed_at",
  createdAt: "created_at"
};

export const passkeyColumns: ColumnMap<PasskeyCredential> = {
  id: "id",
  userId: "user_id",
  credentialId: "credential_id",
  publicKey: "public_key",
  counter: "counter",
  transports: "transports",
  deviceType: "device_type",
  backedUp: "backed_up",
  discoverable: "discoverable",
  name: "name",
  metadata: "metadata",
  createdAt: "created_at",
  updatedAt: "updated_at",
  lastUsedAt: "last_used_at"
};

export const webAuthnChallengeColumns: ColumnMap<WebAuthnChallenge> = {
  id: "id",
  challengeHash: "challenge_hash",
  userId: "user_id",
  mfaChallengeId: "mfa_challenge_id",
  purpose: "purpose",
  expiresAt: "expires_at",
  consumedAt: "consumed_at",
  createdAt: "created_at"
};

export const oauthTransactionReturning = Object.values(oauthTransactionColumns).join(", ");
export const oauthCredentialReturning = Object.values(oauthCredentialColumns).join(", ");
export const totpFactorReturning = Object.values(totpFactorColumns).join(", ");
export const mfaChallengeReturning = Object.values(mfaChallengeColumns).join(", ");
export const passkeyReturning = Object.values(passkeyColumns).join(", ");
export const webAuthnChallengeReturning = Object.values(webAuthnChallengeColumns).join(", ");

export const recoveryCodeReturning = [
  "id",
  "user_id",
  "code_hash",
  "consumed_at",
  "created_at"
].join(", ");
