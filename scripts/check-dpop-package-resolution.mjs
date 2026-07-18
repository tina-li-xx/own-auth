import { pathToFileURL } from "node:url";
import {
  checkPackageResolution,
  repositoryRoot
} from "./package-resolution-check.mjs";

const guardUrl = pathToFileURL(
  `${repositoryRoot}/scripts/portable-subpath-import-guard.mjs`
).href;

await checkPackageResolution({
  fixturePrefix: "own-auth-dpop-resolution-",
  typeScriptSource: `import {
  createDpopProof,
  generateDpopKeyPair,
  type CreateDpopProofInput
} from "own-auth/dpop";

declare const input: CreateDpopProofInput;
const pair = generateDpopKeyPair();
const proof: Promise<string> = createDpopProof(input);
void pair;
void proof;
`,
  runtimeSource: `import { register } from "node:module";
register(${JSON.stringify(guardUrl)}, import.meta.url);
const { createDpopProof, generateDpopKeyPair } = await import("own-auth/dpop");
const keyPair = await generateDpopKeyPair();
if (keyPair.jwkThumbprint.length !== 43) throw new Error("Expected a JWK thumbprint");
const proof = await createDpopProof({
  keyPair,
  method: "POST",
  url: "https://api.example.com/documents?ignored=true"
});
if (proof.split(".").length !== 3) throw new Error("Expected a DPoP proof JWT");
`,
  successMessage:
    "own-auth/dpop resolves without loading core or database dependencies."
});
