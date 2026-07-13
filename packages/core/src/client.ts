import {
  getOwnAuthEndpoint,
  type AuthSessionPayload,
  type DeliveryPayload,
  type OwnAuthEndpointId,
  type OwnAuthEndpointInputMap,
  type OwnAuthEndpointOutputMap,
  type OwnAuthErrorPayload,
  type OwnAuthHttpErrorCode,
  type PublicAuthUser
} from "./http/contract.js";

export interface OwnAuthClientOptions {
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  headers?: OwnAuthClientHeaders | (() => OwnAuthClientHeaders | Promise<OwnAuthClientHeaders>);
}

export type OwnAuthClientHeaders =
  | Headers
  | Record<string, string>
  | [string, string][];

export interface OwnAuthSessionSnapshot {
  data: AuthSessionPayload | null;
  isPending: boolean;
  error: OwnAuthClientError | null;
}

export type OwnAuthSessionListener = () => void;

export class OwnAuthClientError extends Error {
  readonly code: OwnAuthHttpErrorCode;
  readonly status: number;

  constructor(code: OwnAuthHttpErrorCode, message: string, status: number) {
    super(message);
    this.name = "OwnAuthClientError";
    this.code = code;
    this.status = status;
  }
}

export class OwnAuthClient {
  private readonly baseURL: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly configuredHeaders?: OwnAuthClientOptions["headers"];
  private readonly listeners = new Set<OwnAuthSessionListener>();
  private sessionLoaded = false;
  private sessionRequest: Promise<AuthSessionPayload | null> | null = null;
  private snapshot: OwnAuthSessionSnapshot = {
    data: null,
    isPending: true,
    error: null
  };

  constructor(options: OwnAuthClientOptions = {}) {
    this.baseURL = (options.baseURL ?? "/api/auth").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.configuredHeaders = options.headers;
  }

  getSessionSnapshot = (): OwnAuthSessionSnapshot => this.snapshot;

  subscribe = (listener: OwnAuthSessionListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async ensureSession(): Promise<AuthSessionPayload | null> {
    if (this.sessionLoaded) {
      return this.snapshot.data;
    }
    if (this.sessionRequest) {
      return this.sessionRequest;
    }

    const request = this.getSession();
    this.sessionRequest = request;
    try {
      return await request;
    } finally {
      if (this.sessionRequest === request) {
        this.sessionRequest = null;
      }
    }
  }

  async getSession(): Promise<AuthSessionPayload | null> {
    this.updateSnapshot({ ...this.snapshot, isPending: true, error: null });
    try {
      const result = await this.request("getSession", undefined);
      this.sessionLoaded = true;
      this.updateSnapshot({ data: result.session, isPending: false, error: null });
      return result.session;
    } catch (error) {
      const clientError = toClientError(error);
      this.updateSnapshot({ data: null, isPending: false, error: clientError });
      throw clientError;
    }
  }

  async signUpEmailPassword(
    input: OwnAuthEndpointInputMap["signUpEmailPassword"]
  ): Promise<AuthSessionPayload> {
    return this.setCreatedSession(await this.request("signUpEmailPassword", input));
  }

  async signInEmailPassword(
    input: OwnAuthEndpointInputMap["signInEmailPassword"]
  ): Promise<AuthSessionPayload> {
    return this.setCreatedSession(await this.request("signInEmailPassword", input));
  }

  async signOut(): Promise<void> {
    await this.request("signOut", undefined);
    this.sessionLoaded = true;
    this.updateSnapshot({ data: null, isPending: false, error: null });
  }

  async changePassword(
    input: OwnAuthEndpointInputMap["changePassword"]
  ): Promise<PublicAuthUser> {
    const result = await this.request("changePassword", input);
    this.updateUser(result.user);
    return result.user;
  }

  requestMagicLink(
    input: OwnAuthEndpointInputMap["requestMagicLink"]
  ): Promise<DeliveryPayload> {
    return this.request("requestMagicLink", input);
  }

  async verifyMagicLink(
    input: OwnAuthEndpointInputMap["verifyMagicLink"]
  ): Promise<AuthSessionPayload> {
    return this.setCreatedSession(await this.request("verifyMagicLink", input));
  }

  requestEmailVerification(
    input: OwnAuthEndpointInputMap["requestEmailVerification"]
  ): Promise<DeliveryPayload> {
    return this.request("requestEmailVerification", input);
  }

  async verifyEmail(
    input: OwnAuthEndpointInputMap["verifyEmail"]
  ): Promise<PublicAuthUser> {
    const result = await this.request("verifyEmail", input);
    this.updateUser(result.user);
    return result.user;
  }

  requestPasswordReset(
    input: OwnAuthEndpointInputMap["requestPasswordReset"]
  ): Promise<DeliveryPayload> {
    return this.request("requestPasswordReset", input);
  }

  async resetPassword(
    input: OwnAuthEndpointInputMap["resetPassword"]
  ): Promise<PublicAuthUser> {
    const result = await this.request("resetPassword", input);
    this.sessionLoaded = true;
    this.updateSnapshot({ data: null, isPending: false, error: null });
    return result.user;
  }

  requestSmsOtp(
    input: OwnAuthEndpointInputMap["requestSmsOtp"]
  ): Promise<DeliveryPayload> {
    return this.request("requestSmsOtp", input);
  }

  async verifySmsOtp(
    input: OwnAuthEndpointInputMap["verifySmsOtp"]
  ): Promise<OwnAuthEndpointOutputMap["verifySmsOtp"]> {
    const result = await this.request("verifySmsOtp", input);
    if (result.session) {
      this.setCreatedSession({ user: result.user, session: result.session });
    }
    return result;
  }

  acceptInvite(
    input: OwnAuthEndpointInputMap["acceptInvite"]
  ): Promise<OwnAuthEndpointOutputMap["acceptInvite"]> {
    return this.request("acceptInvite", input);
  }

  private async request<Id extends OwnAuthEndpointId>(
    id: Id,
    input: OwnAuthEndpointInputMap[Id]
  ): Promise<OwnAuthEndpointOutputMap[Id]> {
    const endpoint = getOwnAuthEndpoint(id);
    const headers = new Headers(await this.resolveHeaders());
    const init: RequestInit = {
      method: endpoint.method,
      credentials: "include",
      headers
    };

    if (endpoint.request) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(input);
    }

    const response = await this.fetchImpl(`${this.baseURL}${endpoint.path}`, init);
    const body = await readJson(response);
    if (!response.ok) {
      throw clientErrorFromResponse(body, response.status);
    }
    return body as OwnAuthEndpointOutputMap[Id];
  }

  private async resolveHeaders(): Promise<OwnAuthClientHeaders> {
    if (typeof this.configuredHeaders === "function") {
      return this.configuredHeaders();
    }
    return this.configuredHeaders ?? {};
  }

  private setCreatedSession(session: AuthSessionPayload): AuthSessionPayload {
    this.sessionLoaded = true;
    this.updateSnapshot({ data: session, isPending: false, error: null });
    return session;
  }

  private updateUser(user: PublicAuthUser): void {
    if (!this.snapshot.data || this.snapshot.data.user.id !== user.id) {
      return;
    }
    this.updateSnapshot({
      ...this.snapshot,
      data: { ...this.snapshot.data, user },
      error: null
    });
  }

  private updateSnapshot(snapshot: OwnAuthSessionSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export function createOwnAuthClient(options?: OwnAuthClientOptions): OwnAuthClient {
  return new OwnAuthClient(options);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new OwnAuthClientError(
      "internal_error",
      "Own Auth returned an invalid response",
      response.status
    );
  }
}

function clientErrorFromResponse(body: unknown, status: number): OwnAuthClientError {
  if (isErrorPayload(body)) {
    return new OwnAuthClientError(body.error.code, body.error.message, status);
  }
  return new OwnAuthClientError("internal_error", "Authentication request failed", status);
}

function toClientError(error: unknown): OwnAuthClientError {
  return error instanceof OwnAuthClientError
    ? error
    : new OwnAuthClientError("internal_error", "Authentication request failed", 500);
}

function isErrorPayload(value: unknown): value is OwnAuthErrorPayload {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return false;
  }
  const error = (value as { error?: unknown }).error;
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}
