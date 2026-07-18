import { hashSecret } from "./crypto.js";
import { requireEncryptionKeyRing } from "./encryption.js";
import { AuthError } from "./errors.js";
import type { AuthEngineContext } from "./auth-engine-context.js";
import type {
  PublicSamlConnection,
  SamlConnection,
  SamlProtocolConnection,
  SamlRequestSigningInput
} from "./saml-types.js";

const subjectHashLabel = "own-auth:saml:subject:v1";
const requestHashLabel = "own-auth:saml:request:v1";
const relayHashLabel = "own-auth:saml:relay:v1";
const assertionHashLabel = "own-auth:saml:assertion:v1";

export function requireSaml(ctx: AuthEngineContext) {
  if (!ctx.saml || !ctx.samlStorage) {
    throw new AuthError("saml_not_configured", "SAML is not configured", 404);
  }
  return { provider: ctx.saml, storage: ctx.samlStorage };
}

export async function requireSamlConnection(
  ctx: AuthEngineContext,
  connectionId: string,
  allowDisabled = false
): Promise<SamlConnection> {
  const { storage } = requireSaml(ctx);
  const connection = await storage.getConnectionById(connectionId);
  if (!connection) {
    throw new AuthError("saml_connection_not_found", "SAML connection not found", 404);
  }
  if (connection.disabledAt && !allowDisabled) {
    throw new AuthError("saml_connection_disabled", "SAML connection is disabled", 403);
  }
  return connection;
}

export async function protocolConnection(
  ctx: AuthEngineContext,
  connection: SamlConnection
): Promise<SamlProtocolConnection> {
  const { provider, storage } = requireSaml(ctx);
  const metadataUrl = new URL(`${provider.basePath}/saml/metadata`, ctx.baseUrl);
  metadataUrl.searchParams.set("connectionId", connection.id);
  return {
    idpEntityId: connection.idpEntityId,
    ssoUrl: connection.ssoUrl,
    idpCertificates: connection.idpCertificates,
    spEntityId: metadataUrl.toString(),
    acsUrl: new URL(`${provider.basePath}/saml/acs`, ctx.baseUrl).toString(),
    requestSigning: await decryptRequestSigning(ctx, storage, connection)
  };
}

export function publicSamlConnection(connection: SamlConnection): PublicSamlConnection {
  return {
    id: connection.id,
    organisationId: connection.organisationId,
    key: connection.key,
    name: connection.name,
    idpEntityId: connection.idpEntityId,
    ssoUrl: connection.ssoUrl,
    idpCertificates: [...connection.idpCertificates],
    attributeMapping: { ...connection.attributeMapping },
    accountLinking: connection.accountLinking,
    jitProvisioning: {
      enabled: connection.jitProvisioningEnabled,
      defaultRole: connection.jitDefaultRole
    },
    requestSigningEnabled: Boolean(connection.requestSigningKeyCiphertext),
    requestSigningCertificate: connection.requestSigningCertificate,
    disabledAt: connection.disabledAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt
  };
}

export function hashSamlRequest(ctx: AuthEngineContext, value: string): string {
  return domainHash(ctx, requestHashLabel, value);
}

export function hashSamlRelayState(ctx: AuthEngineContext, value: string): string {
  return domainHash(ctx, relayHashLabel, value);
}

export function hashSamlAssertion(
  ctx: AuthEngineContext,
  connectionId: string,
  value: string
): string {
  return domainHash(ctx, assertionHashLabel, `${connectionId}\0${value}`);
}

export function hashSamlSubject(
  ctx: AuthEngineContext,
  connectionKey: string,
  value: string
): string {
  return domainHash(ctx, subjectHashLabel, `${connectionKey}\0${value}`);
}

async function decryptRequestSigning(
  ctx: AuthEngineContext,
  storage: NonNullable<AuthEngineContext["samlStorage"]>,
  connection: SamlConnection
): Promise<SamlRequestSigningInput | undefined> {
  if (!connection.requestSigningKeyCiphertext) return undefined;
  const encryption = requireEncryptionKeyRing(ctx.encryption, "SAML request signing");
  const encrypted = {
    ciphertext: connection.requestSigningKeyCiphertext,
    nonce: required(connection.requestSigningKeyNonce),
    encryptionKeyId: required(connection.requestSigningEncryptionKeyId)
  };
  const metadata = { connectionId: connection.id, organisationId: connection.organisationId };
  const decrypted = await encryption.decrypt(encrypted, "saml-request-signing", metadata);
  if (decrypted.needsRotation) {
    const rotated = await encryption.encrypt(decrypted.plaintext, "saml-request-signing", metadata);
    await storage.updateConnection(connection.id, {
      requestSigningKeyCiphertext: rotated.ciphertext,
      requestSigningKeyNonce: rotated.nonce,
      requestSigningEncryptionKeyId: rotated.encryptionKeyId,
      updatedAt: new Date()
    });
  }
  return {
    privateKey: decrypted.plaintext,
    certificate: required(connection.requestSigningCertificate)
  };
}

function domainHash(ctx: AuthEngineContext, label: string, value: string): string {
  return hashSecret(`${label}\0${value}`, ctx.tokenPepper);
}

function required(value: string | null): string {
  if (!value) throw new AuthError("encrypted_data_invalid", "Encrypted SAML key is invalid", 500);
  return value;
}
