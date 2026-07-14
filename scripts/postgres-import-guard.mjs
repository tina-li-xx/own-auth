export async function resolve(specifier, context, nextResolve) {
  if (specifier === "pg" || specifier.startsWith("pg/")) {
    throw new Error(`Unexpected Postgres driver resolution: ${specifier}`);
  }

  return nextResolve(specifier, context);
}
