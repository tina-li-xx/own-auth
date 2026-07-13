import { OwnAuthHttpError } from "./errors.js";
import { normalizeTrustedWebOrigin } from "../url-security.js";

export function assertCsrfSafe(
  request: Request,
  hasCookieSession: boolean,
  trustedOrigins: readonly string[]
): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    if (isTrustedOrigin(origin, request.url, trustedOrigins)) {
      return;
    }
    throw csrfError();
  }

  if (request.headers.get("sec-fetch-site") === "cross-site" || hasCookieSession) {
    throw csrfError();
  }
}

function isTrustedOrigin(
  origin: string,
  requestUrl: string,
  trustedOrigins: readonly string[]
): boolean {
  const normalizedOrigin = normalizeTrustedWebOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const requestOrigin = normalizeTrustedWebOrigin(requestUrl);
  if (requestOrigin === normalizedOrigin) {
    return true;
  }

  return trustedOrigins.some(
    (trusted) => normalizeTrustedWebOrigin(trusted) === normalizedOrigin
  );
}

function csrfError(): OwnAuthHttpError {
  return new OwnAuthHttpError("csrf_failed", "Request origin is not trusted", 403);
}
