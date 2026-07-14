import type { EndpointExecution } from "./execution.js";
import { encodeBase64Url } from "../encoding.js";

export function createOAuthCallbackResponse(
  execution: EndpointExecution,
  requestUrl: URL,
  headers: Headers
): Response {
  const callback = execution.oauthCallback;
  if (!callback) throw new Error("OAuth callback metadata is missing");
  const message = callbackMessage(execution.body);

  if (callback.interactionMode === "popup") {
    if (!callback.openerOrigin) throw new Error("Popup opener origin is missing");
    return popupResponse(message, callback.openerOrigin, headers);
  }

  const destination = new URL(callback.destination ?? "/", requestUrl);
  destination.searchParams.set("own_auth_status", message.status);
  if (message.status === "failure" && typeof message.error === "object" && message.error) {
    const code = (message.error as Record<string, unknown>).code;
    if (typeof code === "string") destination.searchParams.set("own_auth_error", code);
  }
  headers.set("location", destination.toString());
  headers.delete("content-type");
  return new Response(null, { status: 302, headers });
}

function popupResponse(
  message: OAuthCallbackMessage,
  openerOrigin: string,
  headers: Headers
): Response {
  const nonce = createNonce();
  const payload = JSON.stringify({ source: "own-auth", type: "oauth", ...message });
  const target = JSON.stringify(openerOrigin);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Authentication complete</title></head><body><script nonce="${nonce}">window.opener?.postMessage(${payload},${target});window.close();</script></body></html>`;
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("content-security-policy", `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  headers.set("referrer-policy", "no-referrer");
  return new Response(html, { status: 200, headers });
}

interface OAuthCallbackMessage extends Record<string, unknown> {
  status: string;
}

function callbackMessage(body: unknown): OAuthCallbackMessage {
  if (
    body &&
    typeof body === "object" &&
    "status" in body &&
    typeof body.status === "string"
  ) {
    const status = body.status;
    const value = body as Record<string, unknown>;
    if (status === "mfa_required") {
      return { status, methods: value.methods, expiresAt: value.expiresAt };
    }
    if (status === "failure") return { status, error: value.error };
    return { status };
  }
  throw new Error("OAuth callback status is missing");
}

function createNonce(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(18)));
}
