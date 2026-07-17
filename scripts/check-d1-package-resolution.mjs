import { checkPackageResolution } from "./package-resolution-check.mjs";

await checkPackageResolution({
  fixturePrefix: "own-auth-d1-resolution-",
  typeScriptSource: `import { createD1Persistence, type D1DatabaseLike } from "own-auth/d1";

declare const database: D1DatabaseLike;
const persistence = createD1Persistence(database);
void persistence.storage;
void persistence.rateLimitStore;
`,
  runtimeSource: `import { createD1Persistence } from "own-auth/d1";
if (typeof createD1Persistence !== "function") {
  throw new Error("own-auth/d1 did not expose createD1Persistence");
}
`,
  successMessage:
    "own-auth/d1 resolves in Node, TypeScript node16, and TypeScript bundler modes."
});
