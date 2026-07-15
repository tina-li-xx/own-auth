import { describe, expect, it } from "vitest";
import {
  booleanValue,
  dateValue,
  jsonRecord,
  nullableDate,
  stringArray,
  uint8ArrayValue
} from "../../src/database-row.js";
import { toD1Value } from "../../src/d1/d1-values.js";

describe("D1 value conversion", () => {
  it("maps SQLite dates, booleans, JSON, and nulls", () => {
    const timestamp = Date.parse("2026-08-09T16:00:00.000Z");

    expect(dateValue(timestamp)).toEqual(new Date(timestamp));
    expect(nullableDate(null)).toBeNull();
    expect(booleanValue(0)).toBe(false);
    expect(booleanValue(1)).toBe(true);
    expect(jsonRecord('{"plan":"pro"}')).toEqual({ plan: "pro" });
    expect(jsonRecord("null")).toEqual({});
    expect(jsonRecord(null)).toEqual({});
    expect(stringArray('["password","totp"]')).toEqual(["password", "totp"]);
  });

  it("maps D1 bind values without leaking JavaScript-only types", () => {
    const date = new Date("2026-07-15T12:00:00.000Z");

    expect(toD1Value(date)).toBe(date.getTime());
    expect(toD1Value(true)).toBe(1);
    expect(toD1Value(false)).toBe(0);
    expect(toD1Value({ role: "admin" })).toBe('{"role":"admin"}');
    expect(toD1Value(["read", "write"])).toBe('["read","write"]');
    expect(() => toD1Value(undefined)).toThrow("Unsupported D1 value type");
  });

  it("copies binary values returned by D1", () => {
    const source = Uint8Array.from([1, 2, 3]);
    const mapped = uint8ArrayValue(source.buffer);

    expect([...mapped]).toEqual([1, 2, 3]);
    expect(mapped).not.toBe(source);
  });
});
