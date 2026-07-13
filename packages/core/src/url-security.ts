const blockedRedirectProtocols = new Set([
  "about:",
  "blob:",
  "data:",
  "file:",
  "ftp:",
  "ftps:",
  "gopher:",
  "javascript:",
  "ldap:",
  "ldaps:",
  "mailto:",
  "tel:",
  "vbscript:",
  "ws:",
  "wss:"
]);

export function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function parseAbsoluteUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.username || parsed.password ? null : parsed;
  } catch {
    return null;
  }
}

export function isSafeAuthRedirect(url: URL): boolean {
  if (url.protocol === "https:") {
    return true;
  }
  if (url.protocol === "http:") {
    return isLocalHostname(url.hostname);
  }

  return Boolean(url.hostname) && !blockedRedirectProtocols.has(url.protocol);
}

export function matchesAllowedAuthRedirect(candidate: URL, allowedValue: string): boolean {
  const allowed = parseAbsoluteUrl(allowedValue);
  if (!allowed || !isSafeAuthRedirect(candidate) || !isSafeAuthRedirect(allowed)) {
    return false;
  }

  return (
    candidate.protocol === allowed.protocol &&
    candidate.hostname === allowed.hostname &&
    candidate.port === allowed.port &&
    pathMatches(candidate.pathname, allowed.pathname)
  );
}

export function normalizeTrustedWebOrigin(value: string): string | null {
  const url = parseAbsoluteUrl(value);
  if (!url) {
    return null;
  }
  if (url.protocol === "https:") {
    return url.origin;
  }
  if (url.protocol === "http:" && isLocalHostname(url.hostname)) {
    return url.origin;
  }
  return null;
}

function pathMatches(candidatePath: string, allowedPath: string): boolean {
  if (!allowedPath || allowedPath === "/") {
    return true;
  }

  const prefix = allowedPath.endsWith("/") ? allowedPath : `${allowedPath}/`;
  return candidatePath === allowedPath || candidatePath.startsWith(prefix);
}
