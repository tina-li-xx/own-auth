const blockedPackages = ["@node-saml/node-saml", "pg"];

export async function resolve(specifier, context, nextResolve) {
  if (blockedPackages.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`)
  )) {
    throw new Error(`Unexpected root-package dependency: ${specifier}`);
  }
  return nextResolve(specifier, context);
}
