export function uniqueConformanceValue(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function uniqueConformanceEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

export function uniqueConformancePhone(): string {
  const digits = crypto.randomUUID().replace(/\D/g, "").slice(0, 10).padEnd(10, "0");
  return `+1${digits}`;
}
