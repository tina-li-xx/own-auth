import type { OwnAuth } from "../auth-engine.js";
import { AuthError } from "../errors.js";
import type { RequestContext } from "../types.js";
import { OAuthCallbackError } from "../oauth-types.js";
import { OwnAuthPluginError } from "../plugin-definition.js";
import {
  ownAuthEndpointContract,
  type OwnAuthErrorPayload,
  type OwnAuthHttpErrorCode
} from "./contract.js";
import {
  clearMfaChallengeCookie,
  clearSessionCookie,
  createMfaChallengeCookie,
  createSessionCookie,
  readMfaChallengeToken,
  readSessionToken,
  type OwnAuthMfaCookieOptions,
  type OwnAuthSessionCookieOptions
} from "./cookies.js";
import { assertCsrfSafe } from "./csrf.js";
import { OwnAuthHttpError } from "./errors.js";
import { executeEndpoint, type EndpointExecution } from "./execution.js";
import { createOAuthCallbackResponse } from "./oauth-response.js";
import { pluginInputContract, readEndpointInput } from "./request-input.js";
import { getOwnAuthRoutePath, normalizeOwnAuthBasePath } from "./routing.js";

export interface OwnAuthHandlerOptions {
  basePath?: string;
  cookie?: OwnAuthSessionCookieOptions;
  mfaCookie?: OwnAuthMfaCookieOptions;
  trustedOrigins?: readonly string[];
  maxRequestBodyBytes?: number;
  getRequestContext?: (request: Request) => RequestContext | Promise<RequestContext>;
  onError?: (error: unknown, request: Request) => void | Promise<void>;
}

export type OwnAuthHandler = (request: Request) => Promise<Response>;

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
    if (!routePath) return errorResponse("not_found", "Auth endpoint not found", 404);

    const candidates = ownAuthEndpointContract.filter((endpoint) => endpoint.path === routePath);
    const endpoint = candidates.find((candidate) => candidate.method === request.method);
    const pluginEndpoint = endpoint ? null : auth.findPluginEndpoint(routePath, request.method);
    if (!endpoint) {
      if (pluginEndpoint) {
        return handlePluginEndpoint(auth, pluginEndpoint, request, requestUrl, options);
      }
      const pluginMethods = auth.getPluginEndpointMethods(routePath);
      if (candidates.length === 0 && pluginMethods.length === 0) {
        return errorResponse("not_found", "Auth endpoint not found", 404);
      }
      return errorResponse("method_not_allowed", "Method not allowed", 405, {
        allow: [...candidates.map((candidate) => candidate.method), ...pluginMethods].join(", ")
      });
    }

    const sessionCredential = readSessionToken(request, options.cookie);
    try {
      if (endpoint.csrf !== "oauth_state") {
        assertCsrfSafe(
          request,
          sessionCredential.source === "cookie",
          options.trustedOrigins ?? []
        );
      }
      const input = await readEndpointInput(
        request,
        endpoint,
        endpoint.requestTransport === "form"
          ? Math.min(maxRequestBodyBytes, 64 * 1024)
          : maxRequestBodyBytes
      );
      const context = options.getRequestContext
        ? await options.getRequestContext(request)
        : defaultRequestContext(request);
      const execution = await executeEndpoint(
        auth,
        endpoint.id,
        input,
        sessionCredential.token,
        readMfaChallengeToken(request, options.mfaCookie),
        context
      );
      const headers = responseHeaders();
      applyCookies(headers, execution, requestUrl, options);

      if (endpoint.responseKind === "oauth_callback") {
        return createOAuthCallbackResponse(execution, requestUrl, headers);
      }
      return new Response(JSON.stringify(execution.body), { status: 200, headers });
    } catch (error) {
      return handleRequestError(
        error,
        request,
        requestUrl,
        options,
        endpoint.responseKind === "oauth_callback"
      );
    }
  };
}

async function handlePluginEndpoint(
  auth: OwnAuth,
  registered: NonNullable<ReturnType<OwnAuth["findPluginEndpoint"]>>,
  request: Request,
  requestUrl: URL,
  options: OwnAuthHandlerOptions
): Promise<Response> {
  const credential = readSessionToken(request, options.cookie);
  try {
    assertCsrfSafe(
      request,
      credential.source === "cookie",
      pluginTrustedOrigins(registered, options)
    );
    const contract = pluginInputContract(registered.endpoint.input, registered.endpoint.method);
    const input = await readEndpointInput(
      request,
      contract,
      options.maxRequestBodyBytes ?? 64 * 1024
    );
    const context = options.getRequestContext
      ? await options.getRequestContext(request)
      : defaultRequestContext(request);
    const body = await auth.executePluginEndpoint(
      registered,
      input,
      credential.token,
      context
    );
    const headers = responseHeaders();
    headers.set("x-own-auth-plugin-fingerprint", auth.pluginContractFingerprint);
    return new Response(JSON.stringify(body), { status: 200, headers });
  } catch (error) {
    return handleRequestError(error, request, requestUrl, options, false);
  }
}

async function handleRequestError(
  error: unknown,
  request: Request,
  requestUrl: URL,
  options: OwnAuthHandlerOptions,
  oauthCallback: boolean
): Promise<Response> {
  if (oauthCallback && error instanceof OAuthCallbackError) {
    if (error.statusCode >= 500) await reportError(options.onError, error, request);
    return createOAuthCallbackResponse(
      {
        body: {
          status: "failure",
          error: { code: error.code, message: error.safeMessage }
        },
        oauthCallback: error.callback
      },
      requestUrl,
      responseHeaders()
    );
  }

  const known = knownHttpError(error);
  if (known) {
    if (known.status >= 500) await reportError(options.onError, error, request);
    return errorResponse(known.code, known.message, known.status);
  }

  await reportError(options.onError, error, request);
  return errorResponse("internal_error", "Authentication request failed", 500);
}

function knownHttpError(error: unknown): {
  code: OwnAuthHttpErrorCode;
  message: string;
  status: number;
} | null {
  if (error instanceof AuthError) {
    return { code: error.code, message: error.safeMessage, status: error.statusCode };
  }
  if (error instanceof OwnAuthPluginError) {
    return { code: error.code, message: error.safeMessage, status: error.statusCode };
  }
  if (error instanceof OwnAuthHttpError) {
    return { code: error.code, message: error.message, status: error.statusCode };
  }
  return null;
}

function pluginTrustedOrigins(
  registered: NonNullable<ReturnType<OwnAuth["findPluginEndpoint"]>>,
  options: OwnAuthHandlerOptions
): string[] {
  return [...new Set([
    ...(options.trustedOrigins ?? []),
    ...(registered.plugin.trustedOrigins ?? [])
  ])];
}

function applyCookies(
  headers: Headers,
  execution: EndpointExecution,
  requestUrl: URL,
  options: OwnAuthHandlerOptions
): void {
  if (execution.setSession) {
    headers.append("set-cookie", createSessionCookie(
      execution.setSession.token,
      execution.setSession.expiresAt,
      requestUrl,
      options.cookie
    ));
  } else if (execution.clearSession) {
    headers.append("set-cookie", clearSessionCookie(requestUrl, options.cookie));
  }

  if (execution.setMfaChallenge) {
    headers.append("set-cookie", createMfaChallengeCookie(
      execution.setMfaChallenge.token,
      execution.setMfaChallenge.expiresAt,
      requestUrl,
      options.mfaCookie
    ));
  } else if (execution.clearMfaChallenge) {
    headers.append("set-cookie", clearMfaChallengeCookie(requestUrl, options.mfaCookie));
  }
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
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(payload), { status, headers });
}

async function reportError(
  onError: OwnAuthHandlerOptions["onError"],
  error: unknown,
  request: Request
): Promise<void> {
  if (!onError) return;
  try {
    await onError(error, request);
  } catch {
    // Error reporting must not replace the original auth response.
  }
}
