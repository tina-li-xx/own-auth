import { pathToFileURL } from "node:url";
import {
  checkPackageResolution,
  repositoryRoot
} from "./package-resolution-check.mjs";

const guardUrl = pathToFileURL(
  `${repositoryRoot}/scripts/portable-subpath-import-guard.mjs`
).href;

await checkPackageResolution({
  fixturePrefix: "own-auth-protected-resource-resolution-",
  typeScriptSource: `import {
  createBearerChallenge,
  createOwnAuthProtectedResource,
  type ProtectedResourceTokenVerification
} from "own-auth/protected-resource";

const resource = createOwnAuthProtectedResource({
  introspectionUrl: "https://auth.example.com/oauth/introspect",
  resource: "https://api.example.com/",
  resourceSecret: "oa_rs_example_secret"
});
const challenge: string = createBearerChallenge({ error: "invalid_token" });
declare const verification: ProtectedResourceTokenVerification;
void resource;
void challenge;
void verification;
`,
  runtimeSource: `import { register } from "node:module";
register(${JSON.stringify(guardUrl)}, import.meta.url);
const { createOwnAuthProtectedResource } = await import("own-auth/protected-resource");
const resource = createOwnAuthProtectedResource({
  introspectionUrl: "https://auth.example.com/oauth/introspect",
  resource: "https://api.example.com/",
  resourceSecret: "oa_rs_example_secret",
  fetch: async () => Response.json({ active: false })
});
const result = await resource.verifyAccessToken({ accessToken: "oa_at_example" });
if (result.active) throw new Error("Expected an inactive fixture token");
`,
  successMessage:
    "own-auth/protected-resource resolves without loading core or database dependencies."
});
