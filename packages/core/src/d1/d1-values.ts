import type { D1BindableValue } from "./d1-types.js";

export function toD1Value(value: unknown): D1BindableValue {
  if (value === null || typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (value instanceof ArrayBuffer) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return Uint8Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    ).buffer;
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  throw new TypeError(`Unsupported D1 value type: ${typeof value}`);
}
