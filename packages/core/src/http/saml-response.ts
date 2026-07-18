import type { EndpointExecution } from "./execution.js";

export function createSamlCallbackResponse(
  execution: EndpointExecution,
  requestUrl: URL,
  headers: Headers
): Response {
  const callback = execution.samlCallback;
  if (!callback) throw new Error("SAML callback metadata is missing");
  const body = callbackBody(execution.body);
  const destination = new URL(callback.destination ?? "/", requestUrl);
  destination.searchParams.set("own_auth_status", body.status);
  if (body.error) destination.searchParams.set("own_auth_error", body.error);
  headers.set("location", destination.toString());
  headers.delete("content-type");
  return new Response(null, { status: 302, headers });
}

function callbackBody(body: unknown): { status: string; error?: string } {
  if (!body || typeof body !== "object" || !("status" in body)) {
    throw new Error("SAML callback status is missing");
  }
  const value = body as Record<string, unknown>;
  if (typeof value.status !== "string") {
    throw new Error("SAML callback status is missing");
  }
  const error = value.error;
  return {
    status: value.status,
    ...(typeof error === "object" && error && "code" in error &&
      typeof error.code === "string" ? { error: error.code } : {})
  };
}
