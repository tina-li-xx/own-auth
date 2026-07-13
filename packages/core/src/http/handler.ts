import type { OwnAuth } from "../auth-engine.js";
import { AuthError } from "../errors.js";
import type { RequestContext } from "../types.js";
import {
  ownAuthEndpointContract,
  type OwnAuthEndpointDefinition,
  type OwnAuthEndpointId,
  type OwnAuthEndpointInputMap,
  type OwnAuthErrorPayload,
  type OwnAuthHttpErrorCode
} from "./contract.js";
import {
  getOwnAuthRoutePath,
  normalizeOwnAuthBasePath
} from "./routing.js";
import {
  clearSessionCookie,
  createSessionCookie,
  readSessionToken,
  type OwnAuthSessionCookieOptions
} from "./cookies.js";
import { assertCsrfSafe } from "./csrf.js";
import { OwnAuthHttpError } from "./errors.js";
import {
  serializeAuthSession,
  serializeDelivery,
  serializeMember,
  serializeOrganisation,
  serializeSession,
  serializeUser
} from "./serializers.js";
import { validateEndpointInput } from "./validation.js";

export interface OwnAuthHandlerOptions {
  basePath?: string;
  cookie?: OwnAuthSessionCookieOptions;
  trustedOrigins?: readonly string[];
  maxRequestBodyBytes?: number;
  getRequestContext?: (request: Request) => RequestContext | Promise<RequestContext>;
  onError?: (error: unknown, request: Request) => void | Promise<void>;
}

export type OwnAuthHandler = (request: Request) => Promise<Response>;

interface EndpointExecution {
  body: unknown;
  setSession?: { token: string; expiresAt: Date };
  clearSession?: boolean;
}

export function createOwnAuthHandler(
  auth: OwnAuth,
  options: OwnAuthHandlerOptions = {}
): OwnAuthHandler {
  const basePath = normalizeOwnAuthBasePath(options.basePath ?? "/api/auth");
  const maxRequestBodyBytes = options.maxRequestBodyBytes ?? 64 * 1024;
  if (!Number.isInteger(maxRequestBodyBytes) || maxRequestBodyBytes < 1) {
    throw new Error("maxRequestBodyBytes must be a positive integer");
  }

  return async (request) => {
    const requestUrl = new URL(request.url);
    const routePath = getOwnAuthRoutePath(requestUrl.pathname, basePath);
    if (!routePath) {
      return errorResponse("not_found", "Auth endpoint not found", 404);
    }

    const pathEndpoints = ownAuthEndpointContract.filter(
      (endpoint) => endpoint.path === routePath
    );
    const endpoint = pathEndpoints.find((candidate) => candidate.method === request.method);
    if (!endpoint) {
      if (pathEndpoints.length === 0) {
        return errorResponse("not_found", "Auth endpoint not found", 404);
      }
      return errorResponse(
        "method_not_allowed",
        "Method not allowed",
        405,
        { allow: pathEndpoints.map((candidate) => candidate.method).join(", ") }
      );
    }

    const sessionCredential = readSessionToken(request, options.cookie);
    try {
      assertCsrfSafe(
        request,
        sessionCredential.source === "cookie",
        options.trustedOrigins ?? []
      );
      const body = await readAndValidateBody(
        request,
        endpoint,
        maxRequestBodyBytes
      );
      const context = options.getRequestContext
        ? await options.getRequestContext(request)
        : defaultRequestContext(request);
      const execution = await executeEndpoint(
        auth,
        endpoint.id,
        body,
        sessionCredential.token,
        context
      );

      const headers = responseHeaders();
      if (execution.setSession) {
        headers.set(
          "set-cookie",
          createSessionCookie(
            execution.setSession.token,
            execution.setSession.expiresAt,
            requestUrl,
            options.cookie
          )
        );
      } else if (execution.clearSession) {
        headers.set("set-cookie", clearSessionCookie(requestUrl, options.cookie));
      }

      return new Response(JSON.stringify(execution.body), { status: 200, headers });
    } catch (error) {
      if (error instanceof AuthError) {
        return errorResponse(error.code, error.safeMessage, error.statusCode);
      }
      if (error instanceof OwnAuthHttpError) {
        if (error.statusCode >= 500) {
          await reportError(options.onError, error, request);
        }
        return errorResponse(error.code, error.message, error.statusCode);
      }
      await reportError(options.onError, error, request);
      return errorResponse("internal_error", "Authentication request failed", 500);
    }
  };
}

async function executeEndpoint(
  auth: OwnAuth,
  endpointId: OwnAuthEndpointId,
  rawInput: Record<string, unknown> | undefined,
  sessionToken: string | null,
  request: RequestContext
): Promise<EndpointExecution> {
  switch (endpointId) {
    case "signUpEmailPassword": {
      const input = inputAs(rawInput, endpointId);
      const result = await auth.signUpEmailPassword({ ...input, request });
      return withCreatedSession(result);
    }
    case "signInEmailPassword": {
      const input = inputAs(rawInput, endpointId);
      const result = await auth.signInEmailPassword({ ...input, request });
      return withCreatedSession(result);
    }
    case "getSession": {
      const current = sessionToken ? await auth.getCurrentSession(sessionToken) : null;
      return {
        body: { session: current ? serializeAuthSession(current) : null }
      };
    }
    case "signOut": {
      if (sessionToken) {
        await auth.signOut(sessionToken, request);
      }
      return { body: { success: true }, clearSession: true };
    }
    case "changePassword": {
      const input = inputAs(rawInput, endpointId);
      const user = await auth.changePassword({
        ...input,
        sessionToken: requireSessionToken(sessionToken),
        request
      });
      return { body: { user: serializeUser(user) } };
    }
    case "requestMagicLink": {
      const result = await auth.requestMagicLink({
        ...inputAs(rawInput, endpointId),
        request
      });
      return { body: serializeDelivery(result) };
    }
    case "verifyMagicLink": {
      const result = await auth.verifyMagicLink({
        ...inputAs(rawInput, endpointId),
        request
      });
      return withCreatedSession(result);
    }
    case "requestEmailVerification": {
      const result = await auth.requestEmailVerification({
        ...inputAs(rawInput, endpointId),
        request
      });
      return { body: serializeDelivery(result) };
    }
    case "verifyEmail": {
      const user = await auth.verifyEmail({ ...inputAs(rawInput, endpointId), request });
      return { body: { user: serializeUser(user) } };
    }
    case "requestPasswordReset": {
      const result = await auth.requestPasswordReset({
        ...inputAs(rawInput, endpointId),
        request
      });
      return { body: serializeDelivery(result) };
    }
    case "resetPassword": {
      const user = await auth.resetPassword({ ...inputAs(rawInput, endpointId), request });
      return { body: { user: serializeUser(user) }, clearSession: true };
    }
    case "requestSmsOtp": {
      const input = inputAs(rawInput, endpointId);
      const userId = input.purpose === "phone_verification"
        ? (await auth.requireCurrentSession(requireSessionToken(sessionToken))).user.id
        : undefined;
      const result = await auth.requestSmsOtp({ ...input, userId, request });
      return { body: serializeDelivery(result) };
    }
    case "verifySmsOtp": {
      const result = await auth.verifySmsOtp({ ...inputAs(rawInput, endpointId), request });
      const body = {
        user: serializeUser(result.user),
        session: result.session ? serializeSession(result.session) : null
      };
      return result.session && result.sessionToken
        ? {
            body,
            setSession: {
              token: result.sessionToken,
              expiresAt: result.session.expiresAt
            }
          }
        : { body };
    }
    case "acceptInvite": {
      const current = await auth.requireCurrentSession(requireSessionToken(sessionToken));
      const result = await auth.acceptInvite({
        ...inputAs(rawInput, endpointId),
        userId: current.user.id,
        request
      });
      return {
        body: {
          organisation: serializeOrganisation(result.organisation),
          member: serializeMember(result.member)
        }
      };
    }
  }
}

function withCreatedSession(result: {
  user: Parameters<typeof serializeUser>[0];
  session: Parameters<typeof serializeSession>[0];
  sessionToken: string;
}): EndpointExecution {
  return {
    body: serializeAuthSession(result),
    setSession: { token: result.sessionToken, expiresAt: result.session.expiresAt }
  };
}

function inputAs<Id extends OwnAuthEndpointId>(
  input: Record<string, unknown> | undefined,
  _endpointId: Id
): OwnAuthEndpointInputMap[Id] {
  return input as unknown as OwnAuthEndpointInputMap[Id];
}

async function readAndValidateBody(
  request: Request,
  endpoint: OwnAuthEndpointDefinition,
  maxRequestBodyBytes: number
): Promise<Record<string, unknown> | undefined> {
  if (!endpoint.request) {
    return undefined;
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new OwnAuthHttpError(
      "invalid_request",
      "Content-Type must be application/json",
      415
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxRequestBodyBytes) {
    throw new OwnAuthHttpError("invalid_request", "Request body is too large", 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maxRequestBodyBytes) {
      throw new OwnAuthHttpError("invalid_request", "Request body is too large", 413);
    }
    body = JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof OwnAuthHttpError) {
      throw error;
    }
    throw new OwnAuthHttpError("invalid_request", "Request body must be valid JSON", 400);
  }
  return validateEndpointInput(endpoint, body);
}

function requireSessionToken(token: string | null): string {
  if (!token) {
    throw new AuthError("invalid_session", "Invalid or expired session", 401);
  }
  return token;
}

function defaultRequestContext(request: Request): RequestContext {
  return { userAgent: request.headers.get("user-agent") ?? undefined };
}

function responseHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
}

function errorResponse(
  code: OwnAuthHttpErrorCode,
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  const payload: OwnAuthErrorPayload = { error: { code, message } };
  const headers = responseHeaders();
  for (const [name, value] of Object.entries(extraHeaders)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

async function reportError(
  onError: OwnAuthHandlerOptions["onError"],
  error: unknown,
  request: Request
): Promise<void> {
  if (!onError) {
    return;
  }
  try {
    await onError(error, request);
  } catch {
    // Error reporting must not replace the original auth response.
  }
}
