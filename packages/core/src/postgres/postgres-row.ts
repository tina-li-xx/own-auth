import type { JsonRecord } from "../types.js";
import type { Row } from "./postgres-types.js";

export function expectOne(rows: Row[]): Row {
  const row = rows[0];
  if (!row) {
    throw new Error("Postgres query returned no rows");
  }

  return row;
}

export function toPostgresValue(value: unknown): unknown {
  if (ArrayBuffer.isView(value)) {
    return value;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return value;
}

export function dateValue(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }

  throw new Error("Expected Postgres date value");
}

export function nullableDate(value: unknown): Date | null {
  return value == null ? null : dateValue(value);
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected Postgres string value");
  }

  return value;
}

export function numberValue(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new Error("Expected Postgres number value");
  }
  return number;
}

export function nullableNumber(value: unknown): number | null {
  return value == null ? null : numberValue(value);
}

export function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("Expected Postgres boolean value");
  }
  return value;
}

export function uint8ArrayValue(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  throw new Error("Expected Postgres byte array value");
}

export function jsonRecord(value: unknown): JsonRecord {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    return JSON.parse(value) as JsonRecord;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  return {};
}

export function stringArray(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}
