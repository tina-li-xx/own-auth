import type { ExternalAccountProvider, JsonRecord } from "./types.js";

export type OAuthFlowKind = "redirect" | "one_tap";
export type OAuthIntent = "sign_in" | "link";
export type OAuthInteractionMode = "redirect" | "popup";

export interface OAuthTransaction {
  id: string;
  provider: ExternalAccountProvider;
  flowKind: OAuthFlowKind;
  intent: OAuthIntent;
  stateHash: string;
  destination: string | null;
  interactionMode: OAuthInteractionMode;
  openerOrigin: string | null;
  userId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface OAuthCredential {
  id: string;
  accountId: string;
  provider: ExternalAccountProvider;
  ciphertext: string;
  nonce: string;
  encryptionKeyId: string;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
  rotatedAt: Date | null;
}

export type MfaMethod = "totp" | "recovery_code" | "passkey";
export type MfaFactorStatus = "pending" | "active" | "disabled";

export interface TotpFactor {
  id: string;
  userId: string;
  status: MfaFactorStatus;
  ciphertext: string;
  nonce: string;
  encryptionKeyId: string;
  lastUsedTimestep: number | null;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
}

export interface RecoveryCode {
  id: string;
  userId: string;
  codeHash: string;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface MfaChallenge {
  id: string;
  userId: string;
  tokenHash: string;
  primaryMethod: string;
  methods: MfaMethod[];
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export type WebAuthnChallengePurpose = "registration" | "authentication" | "mfa";

export interface WebAuthnChallenge {
  id: string;
  challengeHash: string;
  userId: string | null;
  mfaChallengeId: string | null;
  purpose: WebAuthnChallengePurpose;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface PasskeyCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
  discoverable: boolean;
  name: string;
  metadata: JsonRecord;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
}
