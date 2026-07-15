import { describe, expect, it } from "vitest";
import type { JsonSchema } from "../src/http/contract.js";
import { isSupportedJsonSchema, matchesJsonSchema } from "../src/http/validation.js";

describe("HTTP schema validation", () => {
  it("supports empty schemas and numeric JSON Schema types", () => {
    expect(matchesJsonSchema({ anything: true }, {})).toBe(true);
    expect(matchesJsonSchema(1.5, { type: "number" })).toBe(true);
    expect(matchesJsonSchema(Number.NaN, { type: "number" })).toBe(false);
    expect(matchesJsonSchema(2, { type: "integer" })).toBe(true);
    expect(matchesJsonSchema(2.5, { type: "integer" })).toBe(false);
  });

  it("applies const, enum, and anyOf constraints using JSON value equality", () => {
    expect(matchesJsonSchema({ role: "admin" }, { enum: [{ role: "admin" }] })).toBe(true);
    expect(matchesJsonSchema(["read"], { const: ["read"] })).toBe(true);
    expect(matchesJsonSchema("ready", {
      anyOf: [{ type: "string", const: "ready" }, { type: "null" }]
    })).toBe(true);
    expect(matchesJsonSchema("other", {
      anyOf: [{ type: "string", const: "ready" }, { type: "null" }]
    })).toBe(false);
  });

  it("fails closed for unsupported types and invalid recursive schemas", () => {
    const unsupportedType = { type: "date" } as JsonSchema;
    const invalidItems = {
      type: "array",
      items: { type: "object", properties: { value: { oneOf: [] } } }
    } as JsonSchema;

    expect(isSupportedJsonSchema(unsupportedType)).toBe(false);
    expect(matchesJsonSchema("2026-07-15", unsupportedType)).toBe(false);
    expect(isSupportedJsonSchema(invalidItems)).toBe(false);
    expect(matchesJsonSchema([], invalidItems)).toBe(false);
    expect(matchesJsonSchema({ toString: "unexpected" }, {
      type: "object",
      properties: {},
      additionalProperties: false
    })).toBe(false);
  });
});
