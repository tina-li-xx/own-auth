import { AuthError } from "../errors.js";
import type { JsonSchema, OwnAuthEndpointDefinition } from "./contract.js";

export function validateEndpointInput(
  endpoint: OwnAuthEndpointDefinition,
  value: unknown
): Record<string, unknown> | undefined {
  if (!endpoint.request) {
    return undefined;
  }

  if (!matchesSchema(value, endpoint.request)) {
    throw new AuthError("validation_error", "Invalid request body", 400);
  }

  return value as Record<string, unknown>;
}

function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    return anyOf.some((candidate) => isSchema(candidate) && matchesSchema(value, candidate));
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return false;
  }

  if ("const" in schema && schema.const !== value) {
    return false;
  }

  switch (schema.type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return matchesString(value, schema);
    case "array":
      return matchesArray(value, schema);
    case "object":
      return matchesObject(value, schema);
    default:
      return true;
  }
}

function matchesString(value: unknown, schema: JsonSchema): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return typeof schema.minLength !== "number" || value.length >= schema.minLength;
}

function matchesArray(value: unknown, schema: JsonSchema): boolean {
  if (!Array.isArray(value)) {
    return false;
  }

  if (!isSchema(schema.items)) {
    return true;
  }

  return value.every((item) => matchesSchema(item, schema.items as JsonSchema));
}

function matchesObject(value: unknown, schema: JsonSchema): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const properties = isRecord(schema.properties)
    ? schema.properties as Record<string, unknown>
    : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];

  if (required.some((key) => !(key in value))) {
    return false;
  }

  if (
    schema.additionalProperties === false &&
    Object.keys(value).some((key) => !(key in properties))
  ) {
    return false;
  }

  return Object.entries(value).every(([key, child]) => {
    const childSchema = properties[key];
    return !childSchema || (isSchema(childSchema) && matchesSchema(child, childSchema));
  });
}

function isSchema(value: unknown): value is JsonSchema {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
