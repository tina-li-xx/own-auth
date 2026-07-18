import { createId, hashSecret, randomBase64Url } from "./crypto.js";
import { requireEncryptionKeyRing } from "./encryption.js";
import { AuthError } from "./errors.js";
import { audit, requireActiveUser } from "./auth-engine-internals.js";
import { requireOrganisationOwner } from "./auth-engine-organisation-access.js";
import type { AuthEngineContext } from "./auth-engine-context.js";
import { parseAbsoluteUrl, normalizeTrustedWebOrigin } from "./url-security.js";
import type {
  CreateSamlConnectionInput,
  PublicSamlConnection,
  SamlAccountLinking,
  SamlConnection,
  SamlConnectionAccessInput,
  SamlMetadataInput,
  UpdateSamlConnectionInput,
  ListSamlConnectionsInput
} from "./saml-types.js";
import {
  protocolConnection,
  publicSamlConnection,
  requireSaml,
  requireSamlConnection
} from "./saml-helpers.js";

export async function createConnection(
  ctx: AuthEngineContext,
  input: CreateSamlConnectionInput
): Promise<PublicSamlConnection> {
  const { storage } = requireSaml(ctx);
  await requireOrganisationOwner(ctx, input.organisationId, input.actorUserId);
  const existing = await storage.listConnectionsByOrganisationId(input.organisationId);
  if (existing.length === 0) await requireNonSamlBootstrap(ctx, input.actorUserId);

  const now = new Date();
  const id = createId("samlc");
  const normalized = normalizeConnectionInput(ctx, input);
  const signing = await encryptSigningKey(ctx, id, input.organisationId, input.requestSigning);
  const connection: SamlConnection = {
    id,
    organisationId: input.organisationId,
    key: `saml_${hashSecret(randomBase64Url(32)).slice(0, 20)}`,
    ...normalized,
    ...signing,
    disabledAt: null,
    createdAt: now,
    updatedAt: now
  };
  let created: SamlConnection;
  try {
    created = await storage.createConnection(connection);
  } catch (error) {
    const duplicate = (await storage.listConnectionsByOrganisationId(input.organisationId))
      .some((candidate) => candidate.idpEntityId === normalized.idpEntityId);
    if (duplicate) {
      throw new AuthError("validation_error", "A matching SAML connection already exists", 409);
    }
    throw error;
  }
  await audit(ctx, {
    eventType: "saml.connection_created",
    actorUserId: input.actorUserId,
    organisationId: input.organisationId,
    context: input.request,
    metadata: { connectionId: created.id }
  });
  return publicSamlConnection(created);
}

export async function getConnection(
  ctx: AuthEngineContext,
  input: SamlConnectionAccessInput
): Promise<PublicSamlConnection> {
  const connection = await requireSamlConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  return publicSamlConnection(connection);
}

export async function listConnections(
  ctx: AuthEngineContext,
  input: ListSamlConnectionsInput
): Promise<PublicSamlConnection[]> {
  const { storage } = requireSaml(ctx);
  await requireOrganisationOwner(ctx, input.organisationId, input.actorUserId);
  return (await storage.listConnectionsByOrganisationId(input.organisationId))
    .map(publicSamlConnection);
}

export async function updateConnection(
  ctx: AuthEngineContext,
  input: UpdateSamlConnectionInput
): Promise<PublicSamlConnection> {
  const { storage } = requireSaml(ctx);
  const connection = await requireSamlConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  const patch = await normalizeConnectionPatch(ctx, connection, input);
  const updated = await storage.updateConnection(connection.id, {
    ...patch,
    updatedAt: new Date()
  });
  if (!updated) throw notFound();
  await audit(ctx, {
    eventType: "saml.connection_updated",
    actorUserId: input.actorUserId,
    organisationId: connection.organisationId,
    context: input.request,
    metadata: { connectionId: connection.id }
  });
  return publicSamlConnection(updated);
}

export async function setConnectionEnabled(
  ctx: AuthEngineContext,
  input: SamlConnectionAccessInput,
  enabled: boolean
): Promise<PublicSamlConnection> {
  const { storage } = requireSaml(ctx);
  const connection = await requireSamlConnection(ctx, input.connectionId, true);
  await requireOrganisationOwner(ctx, connection.organisationId, input.actorUserId);
  const updated = await storage.updateConnection(connection.id, {
    disabledAt: enabled ? null : new Date(),
    updatedAt: new Date()
  });
  if (!updated) throw notFound();
  await audit(ctx, {
    eventType: enabled ? "saml.connection_enabled" : "saml.connection_disabled",
    actorUserId: input.actorUserId,
    organisationId: connection.organisationId,
    context: input.request,
    metadata: { connectionId: connection.id }
  });
  return publicSamlConnection(updated);
}

export async function getMetadata(
  ctx: AuthEngineContext,
  input: SamlMetadataInput
): Promise<string> {
  const { provider } = requireSaml(ctx);
  const connection = await requireSamlConnection(ctx, input.connectionId);
  return provider.createMetadata(await protocolConnection(ctx, connection));
}

async function requireNonSamlBootstrap(ctx: AuthEngineContext, userId: string): Promise<void> {
  const user = await requireActiveUser(ctx, userId);
  const [accounts, passkeys] = await Promise.all([
    ctx.storage.listAccountsByUserId(userId),
    ctx.storage.listPasskeyCredentialsByUserId(userId)
  ]);
  if (
    user.passwordHash || user.email || user.phone || passkeys.length > 0 ||
    accounts.some((account) => !account.provider.startsWith("saml."))
  ) return;
  throw new AuthError(
    "authentication_method_required",
    "The first SAML connection requires a non-SAML owner sign-in method",
    409
  );
}

function normalizeConnectionInput(ctx: AuthEngineContext, input: CreateSamlConnectionInput) {
  const jit = normalizeJit(ctx, input.jitProvisioning);
  return {
    name: nonEmpty(input.name, "name", 100),
    idpEntityId: entityIdentifier(input.idpEntityId),
    ssoUrl: secureEndpoint(input.ssoUrl),
    idpCertificates: certificates(input.idpCertificates),
    attributeMapping: attributeMapping(input.attributeMapping),
    accountLinking: accountLinking(input.accountLinking),
    jitProvisioningEnabled: jit.enabled,
    jitDefaultRole: jit.defaultRole
  };
}

async function normalizeConnectionPatch(
  ctx: AuthEngineContext,
  connection: SamlConnection,
  input: UpdateSamlConnectionInput
): Promise<Partial<SamlConnection>> {
  const patch: Partial<SamlConnection> = {};
  if (input.name !== undefined) patch.name = nonEmpty(input.name, "name", 100);
  if (input.ssoUrl !== undefined) patch.ssoUrl = secureEndpoint(input.ssoUrl);
  if (input.idpCertificates !== undefined) patch.idpCertificates = certificates(input.idpCertificates);
  if (input.attributeMapping !== undefined) patch.attributeMapping = attributeMapping(input.attributeMapping);
  if (input.accountLinking !== undefined) patch.accountLinking = accountLinking(input.accountLinking);
  if (input.jitProvisioning !== undefined) {
    const jit = normalizeJit(ctx, input.jitProvisioning);
    patch.jitProvisioningEnabled = jit.enabled;
    patch.jitDefaultRole = jit.defaultRole;
  }
  if (input.requestSigning !== undefined) {
    Object.assign(
      patch,
      input.requestSigning
        ? await encryptSigningKey(ctx, connection.id, connection.organisationId, input.requestSigning)
        : clearSigningKey()
    );
  }
  return patch;
}

function normalizeJit(
  ctx: AuthEngineContext,
  input: CreateSamlConnectionInput["jitProvisioning"]
): { enabled: boolean; defaultRole: string } {
  const role = input?.defaultRole ?? "member";
  if (!ctx.authorization.hasRole(role) || role === "owner") {
    throw new AuthError("role_not_configured", "SAML JIT requires a configured non-owner role", 409);
  }
  return { enabled: input?.enabled ?? false, defaultRole: role };
}

function accountLinking(value: SamlAccountLinking | undefined): SamlAccountLinking {
  const mode = value ?? "explicit";
  if (mode !== "explicit" && mode !== "verified_email") {
    throw new AuthError("validation_error", "SAML account-linking mode is invalid", 400);
  }
  return mode;
}

async function encryptSigningKey(
  ctx: AuthEngineContext,
  connectionId: string,
  organisationId: string,
  signing: CreateSamlConnectionInput["requestSigning"]
): Promise<Pick<SamlConnection,
  "requestSigningCertificate" | "requestSigningKeyCiphertext" |
  "requestSigningKeyNonce" | "requestSigningEncryptionKeyId">> {
  if (!signing) return clearSigningKey();
  const certificate = nonEmpty(signing.certificate, "requestSigning.certificate", 32_768);
  const privateKey = nonEmpty(signing.privateKey, "requestSigning.privateKey", 32_768);
  const encryption = requireEncryptionKeyRing(ctx.encryption, "SAML request signing");
  const encrypted = await encryption.encrypt(privateKey, "saml-request-signing", {
    connectionId,
    organisationId
  });
  return {
    requestSigningCertificate: certificate,
    requestSigningKeyCiphertext: encrypted.ciphertext,
    requestSigningKeyNonce: encrypted.nonce,
    requestSigningEncryptionKeyId: encrypted.encryptionKeyId
  };
}

function clearSigningKey() {
  return {
    requestSigningCertificate: null,
    requestSigningKeyCiphertext: null,
    requestSigningKeyNonce: null,
    requestSigningEncryptionKeyId: null
  };
}

function entityIdentifier(value: string): string {
  const normalized = nonEmpty(value, "idpEntityId", 2_048);
  const parsed = parseAbsoluteUrl(normalized);
  if (!parsed || !["https:", "urn:"].includes(parsed.protocol)) {
    throw new AuthError("validation_error", "idpEntityId must be an HTTPS URL or URN", 400);
  }
  return parsed.toString();
}

function secureEndpoint(value: string): string {
  const normalized = nonEmpty(value, "ssoUrl", 2_048);
  const parsed = parseAbsoluteUrl(normalized);
  if (!parsed || !normalizeTrustedWebOrigin(parsed.origin)) {
    throw new AuthError("validation_error", "ssoUrl must use HTTPS or a local development URL", 400);
  }
  return parsed.toString();
}

function certificates(values: string[]): string[] {
  if (values.length === 0 || values.length > 10) {
    throw new AuthError("validation_error", "Provide between one and ten IdP certificates", 400);
  }
  return values.map((value) => nonEmpty(value, "idpCertificate", 32_768));
}

function attributeMapping(value: CreateSamlConnectionInput["attributeMapping"]) {
  return {
    subject: value.subject ? nonEmpty(value.subject, "attributeMapping.subject", 512) : "nameId" as const,
    email: nonEmpty(value.email, "attributeMapping.email", 512),
    ...(value.name ? { name: nonEmpty(value.name, "attributeMapping.name", 512) } : {})
  };
}

function nonEmpty(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new AuthError("validation_error", `${field} is invalid`, 400);
  }
  return normalized;
}

function notFound(): AuthError {
  return new AuthError("saml_connection_not_found", "SAML connection not found", 404);
}
