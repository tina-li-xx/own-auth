import type { JsonRecord } from "./types.js";
import type { DatabaseRow } from "./database-types.js";

export function expectDatabaseValue<Row>(
  row: Row | null | undefined,
  context: string
): Row {
  if (!row) {
    throw new Error(`${context} returned no rows`);
  }
  return row;
}

export function expectDatabaseRow(
  rows: readonly DatabaseRow[],
  context: string
): DatabaseRow {
  return expectDatabaseValue(rows[0], context);
}

export function dateValue(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  throw new Error("Expected database date value");
}

export function nullableDate(value: unknown): Date | null {
  return value == null ? null : dateValue(value);
}

export function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function stringValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected database string value");
  }
  return value;
}

export function numberValue(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new Error("Expected database number value");
  }
  return number;
}

export function nullableNumber(value: unknown): number | null {
  return value == null ? null : numberValue(value);
}

export function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 0 || value === 1) {
    return value === 1;
  }
  throw new Error("Expected database boolean value");
}

export function uint8ArrayValue(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
    return Uint8Array.from(value as number[]);
  }
  throw new Error("Expected database byte array value");
}

export function jsonRecord(value: unknown): JsonRecord {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as JsonRecord
    : {};
}

export function stringArray(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
