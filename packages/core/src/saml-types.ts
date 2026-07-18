import type { RequestContext, Session, User } from "./types.js";
import type { MfaMethod } from "./identity-types.js";

export type SamlAccountLinking = "explicit" | "verified_email";
export type SamlIntent = "sign_in" | "link";

export interface SamlAttributeMapping {
  subject?: "nameId" | string;
  email: string;
  name?: string;
}

export interface SamlRequestSigningInput {
  privateKey: string;
  certificate: string;
}

export interface SamlConnection {
  id: string;
  organisationId: string;
  key: string;
  name: string;
  idpEntityId: string;
  ssoUrl: string;
  idpCertificates: string[];
  attributeMapping: SamlAttributeMapping;
  accountLinking: SamlAccountLinking;
  jitProvisioningEnabled: boolean;
  jitDefaultRole: string;
  requestSigningCertificate: string | null;
  requestSigningKeyCiphertext: string | null;
  requestSigningKeyNonce: string | null;
  requestSigningEncryptionKeyId: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicSamlConnection {
  id: string;
  organisationId: string;
  key: string;
  name: string;
  idpEntityId: string;
  ssoUrl: string;
  idpCertificates: string[];
  attributeMapping: SamlAttributeMapping;
  accountLinking: SamlAccountLinking;
  jitProvisioning: { enabled: boolean; defaultRole: string };
  requestSigningEnabled: boolean;
  requestSigningCertificate: string | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SamlTransaction {
  id: string;
  connectionId: string;
  requestIdHash: string;
  relayStateHash: string;
  intent: SamlIntent;
  userId: string | null;
  destination: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface SamlAssertionReplay {
  assertionHash: string;
  connectionId: string;
  consumedAt: Date;
  expiresAt: Date;
}

export interface SamlProtocolConnection {
  idpEntityId: string;
  ssoUrl: string;
  idpCertificates: readonly string[];
  spEntityId: string;
  acsUrl: string;
  requestSigning?: SamlRequestSigningInput;
}

export interface SamlVerifiedAssertion {
  assertionId: string;
  issuer: string;
  nameId: string;
  attributes: Readonly<Record<string, string | readonly string[]>>;
  inResponseTo: string;
  recipient: string;
  expiresAt: Date;
}

export interface SamlProvider {
  readonly kind: "own-auth-saml";
  readonly basePath: string;
  readonly clockSkewMs: number;
  readonly responseTtlMs: number;
  createAuthorizeUrl(input: {
    connection: SamlProtocolConnection;
    requestId: string;
    relayState: string;
  }): Promise<string>;
  verifyResponse(input: {
    connection: SamlProtocolConnection;
    samlResponse: string;
    requestCreatedAt: Date;
    acceptsRequestId(requestId: string): boolean;
  }): Promise<SamlVerifiedAssertion>;
  createMetadata(connection: SamlProtocolConnection): string;
}

export interface CreateSamlConnectionInput {
  organisationId: string;
  actorUserId: string;
  name: string;
  idpEntityId: string;
  ssoUrl: string;
  idpCertificates: string[];
  attributeMapping: SamlAttributeMapping;
  accountLinking?: SamlAccountLinking;
  jitProvisioning?: { enabled: boolean; defaultRole?: string };
  requestSigning?: SamlRequestSigningInput;
  request?: RequestContext;
}

export interface UpdateSamlConnectionInput {
  connectionId: string;
  actorUserId: string;
  name?: string;
  ssoUrl?: string;
  idpCertificates?: string[];
  attributeMapping?: SamlAttributeMapping;
  accountLinking?: SamlAccountLinking;
  jitProvisioning?: { enabled: boolean; defaultRole?: string };
  requestSigning?: SamlRequestSigningInput | null;
  request?: RequestContext;
}

export interface SamlConnectionAccessInput {
  connectionId: string;
  actorUserId: string;
  request?: RequestContext;
}

export interface ListSamlConnectionsInput {
  organisationId: string;
  actorUserId: string;
}

export interface CreateSamlSignInUrlInput {
  connectionId: string;
  destination?: string;
  request?: RequestContext;
}

export interface CreateSamlLinkUrlInput extends CreateSamlSignInUrlInput {
  actorUserId: string;
}

export interface SamlAuthorizationUrl {
  url: string;
  expiresAt: Date;
}

export interface UnlinkSamlIdentityInput {
  connectionId: string;
  actorUserId: string;
  request?: RequestContext;
}

export interface SamlCompletionInput {
  samlResponse: string;
  relayState: string;
  request?: RequestContext;
}

export type SamlCompletionResult =
  | {
      status: "complete";
      user: User;
      session: Session;
      sessionToken: string;
      destination: string | null;
    }
  | {
      status: "mfa_required";
      challengeToken: string;
      methods: MfaMethod[];
      expiresAt: Date;
      destination: string | null;
    }
  | {
      status: "linked";
      destination: string | null;
    };

export interface SamlMetadataInput {
  connectionId: string;
}
