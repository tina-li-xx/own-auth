import type { ExternalAccountProvider } from "./types.js";
import { AuthError, type AuthErrorCode } from "./errors.js";

export type OAuthAccountLinking = "explicit" | "verified_email";

export const externalAccountProviders = ["apple", "github", "google"] as const satisfies
  readonly ExternalAccountProvider[];

const externalAccountProviderSet = new Set<string>(externalAccountProviders);

export function isExternalAccountProvider(value: string): value is ExternalAccountProvider {
  return externalAccountProviderSet.has(value);
}

export interface OAuthCallbackMetadata {
  destination: string | null;
  interactionMode: "redirect" | "popup";
  openerOrigin: string | null;
}

export class OAuthCallbackError extends AuthError {
  readonly callback: OAuthCallbackMetadata;

  constructor(
    code: AuthErrorCode,
    message: string,
    statusCode: number,
    callback: OAuthCallbackMetadata,
    cause?: unknown
  ) {
    super(code, message, statusCode);
    this.name = "OAuthCallbackError";
    this.callback = callback;
    if (cause !== undefined) this.cause = cause;
  }
}

export interface OAuthProviderBaseOptions {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  offlineAccess?: boolean;
}

export interface GoogleOAuthOptions extends OAuthProviderBaseOptions {
  clientSecret: string;
}

export interface GitHubOAuthOptions extends OAuthProviderBaseOptions {
  clientSecret: string;
}

export interface AppleOAuthOptions extends Omit<OAuthProviderBaseOptions, "clientSecret"> {
  teamId: string;
  keyId: string;
  privateKey: string;
}

export interface OAuthOptions {
  accountLinking?: OAuthAccountLinking;
  providers?: {
    google?: GoogleOAuthOptions;
    github?: GitHubOAuthOptions;
    apple?: AppleOAuthOptions;
  };
  adapters?: OAuthProviderAdapter[];
  fetch?: typeof globalThis.fetch;
}

export interface OAuthAuthorizationRequest {
  state: string;
  codeChallenge: string;
  nonce: string;
}

export interface VerifiedProviderIdentity {
  provider: ExternalAccountProvider;
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  imageUrl: string | null;
}

export interface OAuthExchangeResult {
  identity: VerifiedProviderIdentity;
  refreshToken: string | null;
  scopes: string[];
}

export interface OAuthRefreshResult {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
}

export interface OAuthProviderAdapter {
  readonly provider: ExternalAccountProvider;
  readonly redirectUri: string;
  readonly offlineAccess: boolean;
  createAuthorizationUrl(input: OAuthAuthorizationRequest): Promise<URL>;
  exchangeCode(input: {
    callbackParameters: URLSearchParams;
    state: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<OAuthExchangeResult>;
  verifyCredential?(credential: string, nonce: string): Promise<VerifiedProviderIdentity>;
  refresh?(refreshToken: string): Promise<OAuthRefreshResult>;
  revoke?(refreshToken: string): Promise<void>;
}
