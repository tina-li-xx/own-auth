interface TaggedDate {
  $date: string;
}

interface TaggedBytes {
  $bytes: number[];
}

interface TaggedSearchParams {
  $searchParams: string;
}

interface TaggedUndefined {
  $undefined: true;
}

export interface ConformanceRpcRequest {
  method: string;
  args: unknown[];
  options?: {
    smsMaxAttempts?: number;
  };
}

export interface ConformanceRpcError {
  error: {
    code?: string;
    message: string;
  };
}

export function encodeConformanceValue(value: unknown): unknown {
  if (value === undefined) return { $undefined: true } satisfies TaggedUndefined;
  if (value instanceof Date) return { $date: value.toISOString() } satisfies TaggedDate;
  if (value instanceof URLSearchParams) {
    return { $searchParams: value.toString() } satisfies TaggedSearchParams;
  }
  if (value instanceof Uint8Array) {
    return { $bytes: [...value] } satisfies TaggedBytes;
  }
  if (value instanceof ArrayBuffer) {
    return { $bytes: [...new Uint8Array(value)] } satisfies TaggedBytes;
  }
  if (Array.isArray(value)) return value.map(encodeConformanceValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeConformanceValue(entry)])
    );
  }
  return value;
}

export function decodeConformanceValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeConformanceValue);
  if (!isRecord(value)) return value;
  if (typeof value.$date === "string") return new Date(value.$date);
  if (Array.isArray(value.$bytes)) return new Uint8Array(value.$bytes as number[]);
  if (typeof value.$searchParams === "string") return new URLSearchParams(value.$searchParams);
  if (value.$undefined === true) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, decodeConformanceValue(entry)])
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
