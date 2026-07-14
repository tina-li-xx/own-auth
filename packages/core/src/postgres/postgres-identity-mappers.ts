import type {
  MfaChallenge,
  MfaMethod,
  OAuthCredential,
  OAuthFlowKind,
  OAuthIntent,
  OAuthInteractionMode,
  OAuthTransaction,
  PasskeyCredential,
  RecoveryCode,
  TotpFactor,
  WebAuthnChallenge,
  WebAuthnChallengePurpose
} from "../identity-types.js";
import type { ExternalAccountProvider } from "../types.js";
import {
  booleanValue,
  dateValue,
  jsonRecord,
  nullableDate,
  nullableNumber,
  nullableString,
  numberValue,
  stringArray,
  stringValue,
  uint8ArrayValue
} from "./postgres-row.js";
import type { Row } from "./postgres-types.js";

export function mapOAuthTransaction(row: Row): OAuthTransaction {
  return {
    id: stringValue(row.id),
    provider: stringValue(row.provider) as ExternalAccountProvider,
    flowKind: stringValue(row.flow_kind) as OAuthFlowKind,
    intent: stringValue(row.intent) as OAuthIntent,
    stateHash: stringValue(row.state_hash),
    destination: nullableString(row.destination),
    interactionMode: stringValue(row.interaction_mode) as OAuthInteractionMode,
    openerOrigin: nullableString(row.opener_origin),
    userId: nullableString(row.user_id),
    expiresAt: dateValue(row.expires_at),
    consumedAt: nullableDate(row.consumed_at),
    createdAt: dateValue(row.created_at)
  };
}

export function mapOAuthCredential(row: Row): OAuthCredential {
  return {
    id: stringValue(row.id),
    accountId: stringValue(row.account_id),
    provider: stringValue(row.provider) as ExternalAccountProvider,
    ciphertext: stringValue(row.ciphertext),
    nonce: stringValue(row.nonce),
    encryptionKeyId: stringValue(row.encryption_key_id),
    scopes: stringArray(row.scopes),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    rotatedAt: nullableDate(row.rotated_at)
  };
}

export function mapTotpFactor(row: Row): TotpFactor {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    status: stringValue(row.status) as TotpFactor["status"],
    ciphertext: stringValue(row.ciphertext),
    nonce: stringValue(row.nonce),
    encryptionKeyId: stringValue(row.encryption_key_id),
    lastUsedTimestep: nullableNumber(row.last_used_timestep),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    disabledAt: nullableDate(row.disabled_at)
  };
}

export function mapRecoveryCode(row: Row): RecoveryCode {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    codeHash: stringValue(row.code_hash),
    consumedAt: nullableDate(row.consumed_at),
    createdAt: dateValue(row.created_at)
  };
}

export function mapMfaChallenge(row: Row): MfaChallenge {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    tokenHash: stringValue(row.token_hash),
    primaryMethod: stringValue(row.primary_method),
    methods: stringArray(row.methods) as MfaMethod[],
    attempts: numberValue(row.attempts),
    maxAttempts: numberValue(row.max_attempts),
    expiresAt: dateValue(row.expires_at),
    consumedAt: nullableDate(row.consumed_at),
    createdAt: dateValue(row.created_at)
  };
}

export function mapPasskey(row: Row): PasskeyCredential {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    credentialId: stringValue(row.credential_id),
    publicKey: uint8ArrayValue(row.public_key),
    counter: numberValue(row.counter),
    transports: stringArray(row.transports),
    deviceType: stringValue(row.device_type) as PasskeyCredential["deviceType"],
    backedUp: booleanValue(row.backed_up),
    discoverable: booleanValue(row.discoverable),
    name: stringValue(row.name),
    metadata: jsonRecord(row.metadata),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
    lastUsedAt: nullableDate(row.last_used_at)
  };
}

export function mapWebAuthnChallenge(row: Row): WebAuthnChallenge {
  return {
    id: stringValue(row.id),
    challengeHash: stringValue(row.challenge_hash),
    userId: nullableString(row.user_id),
    mfaChallengeId: nullableString(row.mfa_challenge_id),
    purpose: stringValue(row.purpose) as WebAuthnChallengePurpose,
    expiresAt: dateValue(row.expires_at),
    consumedAt: nullableDate(row.consumed_at),
    createdAt: dateValue(row.created_at)
  };
}
