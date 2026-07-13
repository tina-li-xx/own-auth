export function normalizeOwnAuthBasePath(value: string): string {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function getOwnAuthRoutePath(
  pathname: string,
  basePath: string
): string | null {
  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }
  return pathname.slice(basePath.length) || null;
}
