import {
  ownAuthEndpointContract,
  type OwnAuthEndpointDefinition,
  type OwnAuthHttpErrorCode
} from "./contract.js";
import { defaultSessionCookieName } from "./cookies.js";
import { normalizeOwnAuthBasePath } from "./routing.js";

export interface OwnAuthOpenApiOptions {
  title?: string;
  version?: string;
  basePath?: string;
  serverUrl?: string;
  sessionCookieName?: string;
}

export interface OwnAuthOpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
}

export function createOwnAuthOpenApiDocument(
  options: OwnAuthOpenApiOptions = {}
): OwnAuthOpenApiDocument {
  const basePath = normalizeOwnAuthBasePath(options.basePath ?? "/api/auth");
  const document: OwnAuthOpenApiDocument = {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "Own Auth HTTP API",
      version: options.version ?? "1.0.0"
    },
    paths: {},
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: options.sessionCookieName ?? defaultSessionCookieName
        },
        bearerSession: {
          type: "http",
          scheme: "bearer"
        }
      },
      schemas: {
        OwnAuthError: {
          type: "object",
          required: ["error"],
          additionalProperties: false,
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              additionalProperties: false,
              properties: {
                code: { type: "string" },
                message: { type: "string" }
              }
            }
          }
        }
      }
    }
  };

  if (options.serverUrl) {
    document.servers = [{ url: options.serverUrl }];
  }

  for (const endpoint of ownAuthEndpointContract) {
    const path = `${basePath}${endpoint.path}`;
    const pathItem = document.paths[path] ?? {};
    pathItem[endpoint.method.toLowerCase()] = operationFor(endpoint);
    document.paths[path] = pathItem;
  }

  return document;
}

function operationFor(endpoint: OwnAuthEndpointDefinition): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    operationId: endpoint.id,
    summary: endpoint.summary,
    tags: [tagFor(endpoint.path)],
    responses: responsesFor(endpoint),
    "x-own-auth-errors": endpoint.errors
  };

  if (endpoint.request) {
    operation.requestBody = {
      required: true,
      content: {
        "application/json": { schema: endpoint.request }
      }
    };
  }

  if (endpoint.session === "required") {
    operation.security = [{ sessionCookie: [] }, { bearerSession: [] }];
  } else if (endpoint.session === "optional" || endpoint.session === "clear") {
    operation.security = [{}, { sessionCookie: [] }, { bearerSession: [] }];
  }

  return operation;
}

function responsesFor(endpoint: OwnAuthEndpointDefinition): Record<string, unknown> {
  const responses: Record<string, unknown> = {
    "200": {
      description: "Successful response",
      content: {
        "application/json": { schema: endpoint.response }
      }
    }
  };

  const statuses = new Set(endpoint.errors.map(statusForError));
  statuses.add(400);
  statuses.add(403);
  statuses.add(500);
  for (const status of statuses) {
    responses[String(status)] = {
      description: errorDescription(status),
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/OwnAuthError" }
        }
      }
    };
  }

  return responses;
}

function statusForError(code: OwnAuthHttpErrorCode): number {
  if (code === "rate_limited" || code === "otp_attempts_exceeded") return 429;
  if (code === "email_already_exists" || code === "invite_exists") return 409;
  if (code === "permission_denied" || code === "disabled_user" || code === "csrf_failed") return 403;
  if (code === "user_not_found" || code === "organisation_not_found") return 404;
  if (
    code === "invalid_credentials" ||
    code === "invalid_session" ||
    code === "invalid_token" ||
    code === "expired_token" ||
    code === "token_already_used" ||
    code === "invalid_otp"
  ) return 401;
  if (code === "internal_error") return 500;
  return 400;
}

function errorDescription(status: number): string {
  if (status === 401) return "Authentication failed";
  if (status === 403) return "Request forbidden";
  if (status === 404) return "Resource not found";
  if (status === 409) return "Resource conflict";
  if (status === 429) return "Rate limit exceeded";
  if (status === 500) return "Internal error";
  return "Invalid request";
}

function tagFor(path: string): string {
  const segment = path.split("/").filter(Boolean)[0] ?? "auth";
  return segment.replace(/(^|-)([a-z])/g, (_match, _separator, letter: string) =>
    letter.toUpperCase()
  );
}
