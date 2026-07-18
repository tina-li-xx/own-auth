import {
  checkPackageResolution
} from "./package-resolution-check.mjs";

await checkPackageResolution({
  fixturePrefix: "own-auth-saml-resolution-",
  typeScriptSource: `import {
  createSaml,
  type CreateSamlOptions,
  type SamlProvider
} from "own-auth/saml";

declare const options: CreateSamlOptions;
const provider: SamlProvider = createSaml(options);
void provider;
`,
  runtimeSource: `import { createSaml } from "own-auth/saml";
const saml = createSaml();
if (saml.kind !== "own-auth-saml") {
  throw new Error("own-auth/saml did not expose the SAML provider");
}
const metadata = saml.createMetadata({
  idpEntityId: "https://idp.example.com/metadata",
  ssoUrl: "https://idp.example.com/sso",
  idpCertificates: ["AA=="],
  spEntityId: "https://app.example.com/api/auth/saml/metadata?connectionId=samlc_1",
  acsUrl: "https://app.example.com/api/auth/saml/acs"
});
if (!metadata.includes("EntityDescriptor")) {
  throw new Error("own-auth/saml did not generate SP metadata");
}
`,
  successMessage:
    "own-auth/saml resolves in Node, TypeScript node16, and TypeScript bundler modes."
});
