const blockedPackages = [
  "@simplewebauthn",
  "jose",
  "oauth4webapi",
  "otpauth",
  "pg"
];
const blockedFiles = [
  "/dist/auth-engine",
  "/dist/create-own-auth",
  "/dist/d1/",
  "/dist/encryption",
  "/dist/index.js",
  "/dist/postgres/"
];

export async function resolve(specifier, context, nextResolve) {
  if (blockedPackages.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`)
  )) {
    throw new Error(`Unexpected portable-subpath dependency: ${specifier}`);
  }
  const resolved = await nextResolve(specifier, context);
  if (blockedFiles.some((name) => resolved.url.includes(name))) {
    throw new Error(`Unexpected portable-subpath module: ${resolved.url}`);
  }
  return resolved;
}
