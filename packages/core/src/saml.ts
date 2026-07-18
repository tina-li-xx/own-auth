import {
  SAML,
  ValidateInResponseTo,
  type CacheProvider,
  type Profile,
  type SamlOptions
} from "@node-saml/node-saml";
import { SamlProtocolError } from "./saml-protocol-error.js";
import type {
  SamlProvider,
  SamlProtocolConnection,
  SamlVerifiedAssertion
} from "./saml-types.js";
import {
  parseAndValidateSamlResponse,
  parseVerifiedAssertion,
  requiredResponseAttribute
} from "./saml-xml-security.js";

export interface CreateSamlOptions {
  basePath?: string;
  clockSkewMs?: number;
  responseTtlMs?: number;
  maxResponseBytes?: number;
}

const defaultClockSkewMs = 2 * 60 * 1_000;
const defaultResponseTtlMs = 5 * 60 * 1_000;
const defaultMaxResponseBytes = 64 * 1_024;

export function createSaml(options: CreateSamlOptions = {}): SamlProvider {
  const basePath = normalizeBasePath(options.basePath ?? "/api/auth");
  const clockSkewMs = positiveInteger(options.clockSkewMs ?? defaultClockSkewMs, "clockSkewMs");
  const responseTtlMs = positiveInteger(
    options.responseTtlMs ?? defaultResponseTtlMs,
    "responseTtlMs"
  );
  const maxResponseBytes = positiveInteger(
    options.maxResponseBytes ?? defaultMaxResponseBytes,
    "maxResponseBytes"
  );

  const provider: SamlProvider = {
    kind: "own-auth-saml" as const,
    basePath,
    clockSkewMs,
    responseTtlMs,
    async createAuthorizeUrl(input) {
      const saml = createEngine(input.connection, {
        generateUniqueId: () => input.requestId,
        validateInResponseTo: ValidateInResponseTo.never
      });
      return saml.getAuthorizeUrlAsync(input.relayState, undefined, {});
    },
    async verifyResponse(input): Promise<SamlVerifiedAssertion> {
      const response = await parseAndValidateSamlResponse(input.samlResponse, maxResponseBytes);
      const destination = requiredResponseAttribute(response, "Destination");
      if (destination !== input.connection.acsUrl) {
        throw invalid("SAML response destination does not match the ACS URL");
      }

      const saml = createEngine(input.connection, {
        acceptedClockSkewMs: clockSkewMs,
        cacheProvider: requestCache(input.requestCreatedAt, input.acceptsRequestId),
        requestIdExpirationPeriodMs: responseTtlMs,
        validateInResponseTo: ValidateInResponseTo.always,
        wantAssertionsSigned: false,
        wantAuthnResponseSigned: false
      });
      let profile: Profile | null;
      try {
        ({ profile } = await saml.validatePostResponseAsync({
          SAMLResponse: input.samlResponse
        }));
      } catch (error) {
        if (error instanceof SamlProtocolError) throw error;
        throw invalid("SAML response validation failed", error);
      }
      if (!profile?.getAssertionXml || !profile.nameID) {
        throw invalid("SAML response does not contain a valid identity");
      }
      const assertion = await parseVerifiedAssertion(profile.getAssertionXml());
      if (assertion.recipient !== input.connection.acsUrl) {
        throw invalid("SAML assertion recipient does not match the ACS URL");
      }
      if (!input.acceptsRequestId(assertion.inResponseTo)) {
        throw invalid("SAML assertion does not match the authentication request");
      }
      if (profile.issuer !== input.connection.idpEntityId) {
        throw invalid("SAML assertion issuer is not trusted");
      }
      return {
        ...assertion,
        issuer: profile.issuer,
        nameId: profile.nameID,
        attributes: normalizeAttributes(profile.attributes)
      };
    },
    createMetadata(connection) {
      return createEngine(connection, {
        validateInResponseTo: ValidateInResponseTo.never
      }).generateServiceProviderMetadata(
        null,
        connection.requestSigning?.certificate ?? null
      );
    }
  };
  return Object.freeze(provider);
}

function normalizeBasePath(value: string): string {
  const normalized = `/${value}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (normalized.includes("?") || normalized.includes("#")) {
    throw new Error("SAML basePath must be a pathname");
  }
  return normalized || "/";
}

function createEngine(
  connection: SamlProtocolConnection,
  overrides: Partial<SamlOptions>
): SAML {
  return new SAML({
    ...overrides,
    acceptedClockSkewMs: overrides.acceptedClockSkewMs ?? 0,
    audience: connection.spEntityId,
    callbackUrl: connection.acsUrl,
    digestAlgorithm: "sha256",
    entryPoint: connection.ssoUrl,
    idpCert: [...connection.idpCertificates],
    idpIssuer: connection.idpEntityId,
    issuer: connection.spEntityId,
    privateKey: connection.requestSigning?.privateKey,
    publicCert: connection.requestSigning?.certificate,
    signatureAlgorithm: "sha256"
  });
}

function requestCache(
  createdAt: Date,
  acceptsRequestId: (requestId: string) => boolean
): CacheProvider {
  return {
    async saveAsync() { return null; },
    async getAsync(requestId) {
      return acceptsRequestId(requestId) ? createdAt.toISOString() : null;
    },
    async removeAsync(requestId) {
      return requestId && acceptsRequestId(requestId) ? createdAt.toISOString() : null;
    }
  };
}

function normalizeAttributes(value: unknown): Readonly<Record<string, string | readonly string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, string | string[]> = {};
  for (const [name, attribute] of Object.entries(value)) {
    if (typeof attribute === "string") {
      normalized[name] = attribute;
    } else if (Array.isArray(attribute) && attribute.every((item) => typeof item === "string")) {
      normalized[name] = [...attribute];
    } else {
      throw invalid(`SAML attribute ${name} has an unsupported value`);
    }
  }
  return Object.freeze(normalized);
}

function positiveInteger(value: number, option: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`SAML ${option} must be a positive integer`);
  }
  return value;
}

function invalid(message: string, cause?: unknown): SamlProtocolError {
  const error = new SamlProtocolError("saml_response_invalid", message);
  if (cause !== undefined) Object.defineProperty(error, "cause", { value: cause });
  return error;
}

export type {
  SamlProvider,
  SamlProtocolConnection,
  SamlVerifiedAssertion
} from "./saml-types.js";
export { SamlProtocolError } from "./saml-protocol-error.js";
export type { SamlProtocolErrorCode } from "./saml-protocol-error.js";
