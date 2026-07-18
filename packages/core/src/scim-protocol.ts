import { ScimProtocolError } from "./scim-protocol-error.js";
import type { ScimUser, ScimUserAttributes, ScimUserFilter } from "./scim-types.js";
import { isRecord } from "./value-guards.js";

export const scimUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
export const scimListSchema = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const scimPatchSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
export const scimErrorSchema = "urn:ietf:params:scim:api:messages:2.0:Error";

export interface ScimUserRepresentation {
  schemas: [typeof scimUserSchema];
  id: string;
  externalId?: string;
  userName: string;
  active: boolean;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
  emails?: Array<{ value: string; primary: true }>;
  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    version: string;
    location: string;
  };
}

export function parseScimUserPayload(value: unknown): ScimUserAttributes {
  if (!isRecord(value)) throw invalidSyntax("SCIM User body must be an object");
  requireSchema(value.schemas, scimUserSchema);
  const userName = requiredString(value.userName, "userName");
  const name = value.name === undefined ? null : record(value.name, "name");
  return {
    externalId: optionalString(value.externalId, "externalId"),
    userName,
    email: primaryEmail(value.emails),
    displayName: optionalString(value.displayName, "displayName"),
    givenName: name ? optionalString(name.givenName, "name.givenName") : null,
    familyName: name ? optionalString(name.familyName, "name.familyName") : null,
    active: optionalBoolean(value.active, "active") ?? true
  };
}

export function applyScimPatch(current: ScimUser, value: unknown): ScimUserAttributes {
  if (!isRecord(value)) throw invalidSyntax("SCIM PATCH body must be an object");
  requireSchema(value.schemas, scimPatchSchema);
  if (!Array.isArray(value.Operations) || value.Operations.length === 0 ||
      value.Operations.length > 50) {
    throw invalidSyntax("SCIM PATCH Operations must contain between 1 and 50 operations");
  }
  const next: ScimUserAttributes = {
    externalId: current.externalId,
    userName: current.userName,
    email: current.email,
    displayName: current.displayName,
    givenName: current.givenName,
    familyName: current.familyName,
    active: current.active
  };
  for (const operation of value.Operations) applyPatchOperation(next, operation);
  return next;
}

export function parseScimFilter(value: string | null): ScimUserFilter | null {
  if (!value) return null;
  const match = /^\s*(id|externalId|userName)\s+eq\s+"((?:[^"\\]|\\.)*)"\s*$/i.exec(value);
  if (!match) throw new ScimProtocolError(400, "invalidFilter", "SCIM filter is invalid");
  const attribute = match[1]?.toLowerCase();
  const raw = match[2]?.replace(/\\(["\\])/g, "$1") ?? "";
  if (!raw) throw new ScimProtocolError(400, "invalidFilter", "SCIM filter is invalid");
  return {
    attribute: attribute === "externalid"
      ? "externalId"
      : attribute === "username" ? "userName" : "id",
    value: raw
  };
}

export function parsePagination(url: URL): { startIndex: number; count: number } {
  return {
    startIndex: positiveQueryInteger(url.searchParams.get("startIndex"), 1, "startIndex"),
    count: Math.min(positiveQueryInteger(url.searchParams.get("count"), 100, "count"), 100)
  };
}

export function parseIfMatch(value: string | null): number | null {
  if (!value) return null;
  const match = /^W\/"([1-9][0-9]*)"$/.exec(value.trim());
  if (!match) throw invalidSyntax("If-Match must contain a SCIM resource ETag");
  return Number(match[1]);
}

export function scimEtag(version: number): string {
  return `W/"${version}"`;
}

export function scimUserRepresentation(
  user: ScimUser,
  baseUrl: string
): ScimUserRepresentation {
  const representation: ScimUserRepresentation = {
    schemas: [scimUserSchema],
    id: user.id,
    userName: user.userName,
    active: user.active,
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      version: scimEtag(user.version),
      location: `${baseUrl}/Users/${encodeURIComponent(user.id)}`
    }
  };
  if (user.externalId) representation.externalId = user.externalId;
  if (user.displayName) representation.displayName = user.displayName;
  if (user.givenName || user.familyName) {
    representation.name = {};
    if (user.givenName) representation.name.givenName = user.givenName;
    if (user.familyName) representation.name.familyName = user.familyName;
  }
  if (user.email) representation.emails = [{ value: user.email, primary: true }];
  return representation;
}

export function serviceProviderConfig(baseUrl: string) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: `${baseUrl}/Schemas`,
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: true },
    authenticationSchemes: [{
      type: "oauthbearertoken",
      name: "SCIM bearer token",
      description: "Connection-scoped Own Auth SCIM token",
      specUri: "https://www.rfc-editor.org/rfc/rfc6750",
      primary: true
    }]
  };
}

export function resourceTypes(baseUrl: string) {
  return {
    schemas: [scimListSchema],
    totalResults: 1,
    Resources: [userResourceType(baseUrl)]
  };
}

export function schemas(baseUrl: string) {
  return {
    schemas: [scimListSchema],
    totalResults: 1,
    Resources: [userSchema(baseUrl)]
  };
}

export function userResourceType(baseUrl: string) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
    id: "User",
    name: "User",
    endpoint: "/Users",
    schema: scimUserSchema,
    meta: { resourceType: "ResourceType", location: `${baseUrl}/ResourceTypes/User` }
  };
}

export function userSchema(baseUrl: string) {
  return {
    id: scimUserSchema,
    name: "User",
    description: "Own Auth SCIM user",
    attributes: userSchemaAttributes,
    meta: { resourceType: "Schema", location: `${baseUrl}/Schemas/${scimUserSchema}` }
  };
}

const userSchemaAttributes = [
  attribute("userName", "string", true, "readWrite", "server", false),
  attribute("externalId", "string", false, "readWrite", "none", true),
  attribute("displayName", "string", false, "readWrite", "none", false),
  attribute("active", "boolean", false, "readWrite", "none", false),
  attribute("name", "complex", false, "readWrite", "none", false),
  attribute("emails", "complex", false, "readWrite", "none", false, true)
];

function applyPatchOperation(target: ScimUserAttributes, value: unknown): void {
  if (!isRecord(value)) throw invalidSyntax("SCIM PATCH operation must be an object");
  const operation = requiredString(value.op, "op").toLowerCase();
  if (operation !== "add" && operation !== "replace" && operation !== "remove") {
    throw invalidSyntax("SCIM PATCH operation is unsupported");
  }
  const path = optionalString(value.path, "path");
  if (!path) {
    if (operation === "remove" || !isRecord(value.value)) {
      throw new ScimProtocolError(400, "invalidPath", "SCIM PATCH path is required");
    }
    mergeUserObject(target, value.value);
    return;
  }
  applyPath(target, operation, path, value.value);
}

function applyPath(
  target: ScimUserAttributes,
  operation: string,
  rawPath: string,
  value: unknown
): void {
  const path = rawPath.toLowerCase();
  const removing = operation === "remove";
  if (path === "username") {
    if (removing) throw new ScimProtocolError(400, "mutability", "userName is required");
    target.userName = requiredString(value, "userName");
  } else if (path === "externalid") {
    target.externalId = removing ? null : optionalString(value, "externalId");
  } else if (path === "displayname") {
    target.displayName = removing ? null : optionalString(value, "displayName");
  } else if (path === "name.givenname") {
    target.givenName = removing ? null : optionalString(value, "name.givenName");
  } else if (path === "name.familyname") {
    target.familyName = removing ? null : optionalString(value, "name.familyName");
  } else if (path === "active") {
    if (removing) throw new ScimProtocolError(400, "invalidValue", "active cannot be removed");
    target.active = requiredBoolean(value, "active");
  } else if (/^emails(?:\[[^\]]+\])?(?:\.value)?$/.test(path)) {
    target.email = removing
      ? null
      : Array.isArray(value) ? primaryEmail(value) : requiredString(value, "emails.value");
  } else {
    throw new ScimProtocolError(400, "invalidPath", "SCIM PATCH path is unsupported");
  }
}

function mergeUserObject(target: ScimUserAttributes, value: Record<string, unknown>): void {
  if (value.userName !== undefined) target.userName = requiredString(value.userName, "userName");
  if (value.externalId !== undefined) target.externalId = optionalString(value.externalId, "externalId");
  if (value.displayName !== undefined) target.displayName = optionalString(value.displayName, "displayName");
  if (value.active !== undefined) target.active = requiredBoolean(value.active, "active");
  if (value.emails !== undefined) target.email = primaryEmail(value.emails);
  if (value.name !== undefined) {
    const name = record(value.name, "name");
    if (name.givenName !== undefined) target.givenName = optionalString(name.givenName, "name.givenName");
    if (name.familyName !== undefined) target.familyName = optionalString(name.familyName, "name.familyName");
  }
}

function primaryEmail(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 20) throw invalidSyntax("emails is invalid");
  const emails = value.map((entry) => {
    const item = record(entry, "emails");
    return {
      value: requiredString(item.value, "emails.value"),
      primary: item.primary === true
    };
  });
  return (emails.find((email) => email.primary) ?? emails[0])?.value ?? null;
}

function requireSchema(value: unknown, schema: string): void {
  if (!Array.isArray(value) || !value.includes(schema)) {
    throw invalidSyntax(`SCIM schemas must include ${schema}`);
  }
}

function positiveQueryInteger(value: string | null, fallback: number, label: string): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ScimProtocolError(400, "invalidValue", `${label} is invalid`);
  }
  return parsed;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ScimProtocolError(400, "invalidValue", `${label} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new ScimProtocolError(400, "invalidValue", `${label} is invalid`);
  }
  return value.trim() || null;
}

function optionalBoolean(value: unknown, label: string): boolean | null {
  if (value === undefined || value === null) return null;
  return requiredBoolean(value, label);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ScimProtocolError(400, "invalidValue", `${label} is invalid`);
  }
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ScimProtocolError(400, "invalidValue", `${label} is invalid`);
  return value;
}

function invalidSyntax(message: string): ScimProtocolError {
  return new ScimProtocolError(400, "invalidSyntax", message);
}

function attribute(
  name: string,
  type: string,
  required: boolean,
  mutability: string,
  uniqueness: string,
  caseExact: boolean,
  multiValued = false
) {
  return { name, type, required, mutability, uniqueness, caseExact, multiValued };
}
