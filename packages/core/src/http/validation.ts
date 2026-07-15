import { AuthError } from "../errors.js";
import type { JsonSchema, OwnAuthEndpointDefinition } from "./contract.js";

const supportedSchemaTypes = new Set([
  "null",
  "boolean",
  "string",
  "number",
  "integer",
  "array",
  "object"
]);
const supportedSchemaKeywords = new Set([
  "type",
  "enum",
  "const",
  "anyOf",
  "format",
  "minLength",
  "items",
  "properties",
  "required",
  "additionalProperties",
  "title",
  "description"
]);

export function validateEndpointInput(
  endpoint: Pick<OwnAuthEndpointDefinition, "request">,
  value: unknown
): Record<string, unknown> | undefined {
  if (!endpoint.request) {
    return undefined;
  }

  if (!matchesJsonSchema(value, endpoint.request)) {
    throw new AuthError("validation_error", "Invalid request body", 400);
  }

  return value as Record<string, unknown>;
}

export function isSupportedJsonSchema(value: unknown): value is JsonSchema {
  return validateSchema(value, new Set<object>());
}

export function matchesJsonSchema(value: unknown, schema: JsonSchema): boolean {
  return isSupportedJsonSchema(schema) && matchesSupportedSchema(value, schema);
}

function matchesSupportedSchema(value: unknown, schema: JsonSchema): boolean {
  if (
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some((candidate) => matchesSupportedSchema(value, candidate as JsonSchema))
  ) {
    return false;
  }

  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => jsonValuesEqual(candidate, value))
  ) {
    return false;
  }

  if ("const" in schema && !jsonValuesEqual(schema.const, value)) {
    return false;
  }

  switch (schema.type) {
    case undefined:
      return true;
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return matchesString(value, schema);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "array":
      return matchesArray(value, schema);
    case "object":
      return matchesObject(value, schema);
    default:
      return false;
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

  if (!schema.items) {
    return true;
  }

  return value.every((item) => matchesSupportedSchema(item, schema.items as JsonSchema));
}

function matchesObject(value: unknown, schema: JsonSchema): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }

  const properties = isPlainRecord(schema.properties)
    ? schema.properties as Record<string, JsonSchema>
    : {};
  const required = Array.isArray(schema.required) ? schema.required as readonly string[] : [];

  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    return false;
  }

  if (
    schema.additionalProperties === false &&
    Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(properties, key))
  ) {
    return false;
  }

  return Object.entries(value).every(([key, child]) => {
    const childSchema = Object.prototype.hasOwnProperty.call(properties, key)
      ? properties[key]
      : undefined;
    return childSchema === undefined || matchesSupportedSchema(child, childSchema);
  });
}

function validateSchema(value: unknown, ancestors: Set<object>): value is JsonSchema {
  if (!isPlainRecord(value) || ancestors.has(value)) {
    return false;
  }
  if (Object.keys(value).some((key) => !supportedSchemaKeywords.has(key))) {
    return false;
  }
  if (Object.values(value).some((entry) => entry === undefined)) {
    return false;
  }

  const type = value.type;
  if (type !== undefined && (typeof type !== "string" || !supportedSchemaTypes.has(type))) {
    return false;
  }
  if (value.title !== undefined && typeof value.title !== "string") return false;
  if (value.description !== undefined && typeof value.description !== "string") return false;

  if (value.enum !== undefined) {
    if (!Array.isArray(value.enum) || value.enum.length === 0) return false;
    if (!value.enum.every((entry) => isJsonValue(entry, new Set<object>()))) return false;
  }
  if ("const" in value && !isJsonValue(value.const, new Set<object>())) return false;

  const nextAncestors = new Set(ancestors).add(value);
  if (value.anyOf !== undefined) {
    if (!Array.isArray(value.anyOf) || value.anyOf.length === 0) return false;
    if (!value.anyOf.every((candidate) => validateSchema(candidate, nextAncestors))) return false;
  }

  if (value.format !== undefined && (type !== "string" || typeof value.format !== "string")) {
    return false;
  }
  if (
    value.minLength !== undefined &&
    (
      type !== "string" ||
      typeof value.minLength !== "number" ||
      !Number.isInteger(value.minLength) ||
      value.minLength < 0
    )
  ) {
    return false;
  }
  if (value.items !== undefined && (type !== "array" || !validateSchema(value.items, nextAncestors))) {
    return false;
  }
  if (value.properties !== undefined) {
    if (type !== "object" || !isPlainRecord(value.properties)) return false;
    if (!Object.values(value.properties).every((candidate) => validateSchema(candidate, nextAncestors))) {
      return false;
    }
  }
  if (value.required !== undefined) {
    if (
      type !== "object" ||
      !Array.isArray(value.required) ||
      !value.required.every((key) => typeof key === "string") ||
      new Set(value.required).size !== value.required.length
    ) {
      return false;
    }
  }
  if (
    value.additionalProperties !== undefined &&
    (type !== "object" || typeof value.additionalProperties !== "boolean")
  ) {
    return false;
  }

  return true;
}

function isJsonValue(value: unknown, ancestors: Set<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, nextAncestors));
  }
  if (!isPlainRecord(value)) return false;
  return Object.values(value).every((entry) => isJsonValue(entry, nextAncestors));
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) =>
      jsonValuesEqual(entry, right[index])
    );
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(right, key) && jsonValuesEqual(left[key], right[key])
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
