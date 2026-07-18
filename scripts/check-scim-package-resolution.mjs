import {
  checkPackageResolution
} from "./package-resolution-check.mjs";

await checkPackageResolution({
  fixturePrefix: "own-auth-scim-resolution-",
  typeScriptSource: `import {
  createOwnAuthScimHandler,
  createOwnAuthScimOpenApiDocument,
  type OwnAuthScimHandler,
  type OwnAuthScimHandlerOptions
} from "own-auth/scim";

declare const auth: Parameters<typeof createOwnAuthScimHandler>[0];
declare const options: OwnAuthScimHandlerOptions;
const handler: OwnAuthScimHandler = createOwnAuthScimHandler(auth, options);
void handler;
`,
  runtimeSource: `import { createOwnAuthScimOpenApiDocument } from "own-auth/scim";
const document = createOwnAuthScimOpenApiDocument();
if (!document.paths["/scim/v2/Users"]) {
  throw new Error("own-auth/scim did not expose the SCIM API contract");
}
`,
  successMessage:
    "own-auth/scim resolves in Node, TypeScript node16, and TypeScript bundler modes."
});
