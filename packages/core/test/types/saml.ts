import {
  createOwnAuth,
  InMemoryAuthStorage,
  type PublicSamlConnection,
  type SamlCapableStorage
} from "../../src/index.js";
import { createSaml } from "../../src/saml.js";

const samlStorage: SamlCapableStorage = new InMemoryAuthStorage();

export const samlAuth = createOwnAuth({
  storage: samlStorage,
  tokenPepper: "saml-type-contract-pepper",
  baseUrl: "https://app.example.com",
  saml: createSaml()
});

export const samlConnection: Promise<PublicSamlConnection> =
  samlAuth.saml.createConnection({
    organisationId: "org_example",
    actorUserId: "usr_owner",
    name: "Example Identity",
    idpEntityId: "https://idp.example.com/metadata",
    ssoUrl: "https://idp.example.com/sso",
    idpCertificates: ["certificate"],
    attributeMapping: { email: "email" }
  });

samlAuth.saml.createSignInUrl({
  connectionId: "samlc_example",
  destination: "/dashboard"
});

samlAuth.saml.updateConnection({
  connectionId: "samlc_example",
  actorUserId: "usr_owner",
  // @ts-expect-error The IdP entity identifier is immutable.
  idpEntityId: "https://other-idp.example.com/metadata"
});
