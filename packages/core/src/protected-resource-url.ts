import { isLocalHostname, parseAbsoluteUrl } from "./url-security.js";

export function normalizeProtectedResourceUrl(
  value: string,
  allowLocalHttp: boolean
): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) {
    return null;
  }
  const parsed = parseAbsoluteUrl(value.trim());
  if (
    !parsed ||
    parsed.hash ||
    parsed.search ||
    (parsed.protocol !== "https:" &&
      !(allowLocalHttp && parsed.protocol === "http:" && isLocalHostname(parsed.hostname)))
  ) {
    return null;
  }
  return parsed.toString();
}
